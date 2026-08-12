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
  // Fires with the real server order id every time a queued (offline) order
  // successfully syncs - lets the POS ping the kitchen so orders taken during
  // an outage still reach the kitchen display the moment the internet returns.
  readonly orderSynced = new Subject<number>();
  private flushing = false;

  constructor() {
    window.addEventListener('online', () => {
      this.isOffline.set(false);
      void this.flush();
    });
    window.addEventListener('offline', () => this.isOffline.set(true));
    this.isOffline.set(!navigator.onLine);
    void this.refreshPending();
  }

  // ── Menu cache: served when the API is unreachable ──────────────────────

  async cacheMenu(key: string, data: unknown): Promise<void> {
    await Preferences.set({ key: `cache:menu:${key}`, value: JSON.stringify(data) });
  }

  async cachedMenu(key: string): Promise<any | null> {
    const { value } = await Preferences.get({ key: `cache:menu:${key}` });
    return value ? JSON.parse(value) : null;
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
          const syncedId = res?.id;
          if (typeof syncedId === 'number') this.orderSynced.next(syncedId);
        } catch (e: any) {
          const status = e?.status;
          if (!status) break; // still offline - stop and retry later
          if (status >= 400 && status < 500) {
            // Server rejected it (bad request etc.) - drop so the queue can't jam.
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
