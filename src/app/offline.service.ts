import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Preferences } from '@capacitor/preferences';
import { Subject, firstValueFrom } from 'rxjs';

// Offline support: watches connectivity, caches menu data, and queues orders
// placed while the internet is down. Queued orders replay in order as soon as
// connectivity returns. Everything persists in device storage, so a killed app
// doesn't lose queued orders.
@Injectable({ providedIn: 'root' })
export class OfflineService {
  private http = inject(HttpClient);

  isOffline = signal(false);
  pendingOrders = signal(0);
  // Orders the server rejected on sync (4xx: stock/price/item changed). Kept
  // visible instead of dropped silently so the cashier can act.
  failedOrders = signal(0);
  // Fires with the synced cloud order (has id + items) every time a queued
  // (offline) order successfully syncs - lets the POS ping the kitchen so
  // orders taken during an outage still reach the kitchen the moment the
  // internet returns.
  readonly orderSynced = new Subject<any>();
  private flushing = false;

  constructor() {
    window.addEventListener('online', () => {
      this.isOffline.set(false);
      void this.flush();
    });
    window.addEventListener('offline', () => this.isOffline.set(true));
    this.isOffline.set(!navigator.onLine);
    void this.refreshPending();
    void this.refreshFailed();
  }

  // ── Menu cache: served when the API is unreachable ──────────────────────

  async cacheMenu(key: string, data: unknown): Promise<void> {
    await Preferences.set({ key: `cache:menu:${key}`, value: JSON.stringify(data) });
  }

  async cachedMenu(key: string): Promise<any | null> {
    const { value } = await Preferences.get({ key: `cache:menu:${key}` });
    return value ? JSON.parse(value) : null;
  }

  // ETag for the cached payload, so a conditional GET can 304 and reuse the
  // cache instead of re-downloading. Stored next to the cache so both survive
  // an app restart (and stay consistent - the etag matches the cached body).
  async menuEtag(key: string): Promise<string | null> {
    const { value } = await Preferences.get({ key: `cache:etag:${key}` });
    return value ?? null;
  }

  async setMenuEtag(key: string, etag: string | null): Promise<void> {
    if (etag) await Preferences.set({ key: `cache:etag:${key}`, value: etag });
    else await Preferences.remove({ key: `cache:etag:${key}` });
  }

  // ── Order queue: replay when back online ────────────────────────────────

  async queueOrder(url: string, body: any): Promise<void> {
    const list = await this.queue();
    list.push({ url, body, queuedAt: new Date().toISOString() });
    await Preferences.set({ key: 'queue:orders', value: JSON.stringify(list) });
    await this.refreshPending();
  }

  private async queue(): Promise<any[]> {
    const { value } = await Preferences.get({ key: 'queue:orders' });
    return value ? JSON.parse(value) : [];
  }

  private async refreshPending(): Promise<void> {
    this.pendingOrders.set((await this.queue()).length);
  }

  // ── Failed sync queue: rejected orders stay visible, never silently dropped ──

  async failOrder(url: string, body: any): Promise<void> {
    const list = await this.failed();
    list.push({ url, body, failedAt: new Date().toISOString() });
    await Preferences.set({ key: 'queue:failed', value: JSON.stringify(list) });
    await this.refreshFailed();
  }

  private async failed(): Promise<any[]> {
    const { value } = await Preferences.get({ key: 'queue:failed' });
    return value ? JSON.parse(value) : [];
  }

  private async refreshFailed(): Promise<void> {
    this.failedOrders.set((await this.failed()).length);
  }

  async retryFailed(): Promise<void> {
    const failed = await this.failed();
    if (!failed.length) return;
    await Preferences.remove({ key: 'queue:failed' });
    await this.refreshFailed();
    const list = await this.queue();
    await Preferences.set({ key: 'queue:orders', value: JSON.stringify([...failed, ...list]) });
    await this.refreshPending();
    void this.flush();
  }

  async dismissFailed(): Promise<void> {
    await Preferences.remove({ key: 'queue:failed' });
    await this.refreshFailed();
  }

  async flush(): Promise<void> {
    if (this.flushing || !navigator.onLine) return;
    const list = await this.queue();
    if (!list.length) return;
    this.flushing = true;
    try {
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        try {
          const res: any = await firstValueFrom(this.http.post(item.url, item.body));
          list.splice(i, 1);
          i--;
          await Preferences.set({ key: 'queue:orders', value: JSON.stringify(list) });
          if (res?.id != null) this.orderSynced.next(res);
        } catch (e: any) {
          const status = e?.status;
          if (!status) break; // still offline - stop and retry later
          if (status >= 400 && status < 500) {
            // Server rejected it (bad request etc.) - keep it visible so the
            // cashier can act (stock/price changed), don't drop it silently.
            await this.failOrder(item.url, item.body);
            list.splice(i, 1);
            i--;
            await Preferences.set({ key: 'queue:orders', value: JSON.stringify(list) });
          } else {
            break; // server hiccup - retry on next flush
          }
        }
      }
    } finally {
      this.flushing = false;
      await this.refreshPending();
    }
  }
}
