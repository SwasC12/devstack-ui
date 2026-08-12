import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { MenuItemService } from '../../menu-item.service';
import { SoundService } from '../../sound.service';

// Kitchen display: a second tablet (same app, Kitchen tab) shows the live
// order queue. Instant updates arrive via the LAN webhook (the POS pings this
// tablet's local server after checkout - zero server traffic, zero FCM quota);
// a slow 5-minute conditional poll (ETag -> cheap 304 when nothing changed) is
// only the safety net for a missed ping. Polls are background requests: they
// never show the global loader, never re-render an unchanged queue, and pause
// while the app is backgrounded. "Done" removes an order from the queue (it
// stays in revenue).
@Component({
  selector: 'app-kitchen',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './kitchen.component.html',
  styleUrl: './kitchen.component.scss',
})
export class KitchenComponent implements OnInit, OnDestroy {
  private service = inject(MenuItemService);
  private sound = inject(SoundService);

  readonly orders = signal<any[]>([]);
  readonly lastRefresh = signal<Date | null>(null);
  readonly newOrderId = signal<number | null>(null);
  readonly firstLoad = signal(true);
  readonly offline = signal(false);
  // Kiosk lock: pins this tablet to the kitchen screen (hides the app nav).
  readonly kiosk = signal(false);
  // Orders pinged over the LAN while the cloud was unreachable (offline POS
  // queue) - shown as "pending sync" cards until they appear in the queue.
  readonly pendingSync = signal<{ id: string; summary: string; at: number }[]>([]);

  private static readonly POLL_MS = 300000; // healthy safety net: 5 min
  private static readonly RETRY_MS = 30000;  // offline: fast retry so catch-up is quick
  private static readonly PENDING_TTL = 15 * 60 * 1000; // strip cards expire after 15 min
  private pollMs = KitchenComponent.POLL_MS;
  private timer: ReturnType<typeof setInterval> | null = null;
  private seen = new Set<number>();
  private etag: string | null = null;
  private lastSig = '';
  private inFlight = false;
  private active = true;
  private serverHandle: any = null;
  private appHandle: any = null;

  ngOnInit() {
    void this.refresh();
    void this.loadKiosk();
    this.schedule();
    void this.listenForWebhook();
    this.watchAppState();
  }

  private schedule() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => void this.refresh(), this.pollMs);
  }

  ngOnDestroy() {
    if (this.timer) clearInterval(this.timer);
    try { this.serverHandle?.remove(); } catch { /* ignore */ }
    try { this.appHandle?.remove(); } catch { /* ignore */ }
    try { (Capacitor as any).Plugins?.KitchenServer?.stop(); } catch { /* ignore */ }
  }

  // The POS pings this tablet's local server (KitchenServerPlugin, port 8123)
  // after every checkout - refresh instantly when that lands. The ping carries
  // an item summary too: while the cloud is unreachable, that summary becomes
  // a "pending sync" card so the kitchen still sees what the POS is taking.
  private async listenForWebhook() {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const plugin = (Capacitor as any).Plugins?.KitchenServer;
      if (!plugin) return;
      await plugin.start();
      this.serverHandle = await plugin.addListener('order', (e: any) => {
        if (e?.summary) this.addPending(String(e.id ?? ''), String(e.summary));
        void this.refresh();
      });
    } catch { /* webhook unavailable - poll still covers it */ }
  }

  private addPending(id: string, summary: string) {
    if (!summary || !this.offline()) return; // online: the normal refresh shows it
    this.pendingSync.update(list => [...list.filter(p => p.id !== id && p.summary !== summary), { id, summary, at: Date.now() }]);
    this.sound.notification();
  }

  // ── Kiosk lock: lock/unlock the wall tablet to this screen ────────────────

  private async loadKiosk() {
    const { value } = await Preferences.get({ key: 'kiosk' });
    this.kiosk.set(value === '1');
  }

  toggleKiosk() {
    if (!this.kiosk()) {
      this.kiosk.set(true);
      void Preferences.set({ key: 'kiosk', value: '1' });
    }
  }

  private holdTimer: any = null;
  startHold() {
    if (!this.kiosk()) return;
    this.holdTimer = setTimeout(() => {
      this.kiosk.set(false);
      void Preferences.remove({ key: 'kiosk' });
    }, 1200);
  }

  cancelHold() {
    if (this.holdTimer) { clearTimeout(this.holdTimer); this.holdTimer = null; }
  }

  // Screen off / another app in front -> stop polling (wall display, nobody
  // watching). Refresh immediately on resume so nothing is missed.
  private watchAppState() {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const app = (Capacitor as any).Plugins?.App;
      if (!app) return;
      app.addListener('appStateChange', (state: { isActive: boolean }) => {
        this.active = state.isActive;
        if (state.isActive) void this.refresh();
      }).then((h: any) => { this.appHandle = h; });
    } catch { /* ignore */ }
  }

  private refresh() {
    if (this.inFlight || !this.active) return;
    this.inFlight = true;
    this.service.getKitchenOrders(120, this.etag).subscribe({
      next: ({ list, etag }) => {
        if (etag) this.etag = etag;
        this.lastRefresh.set(new Date());
        this.offline.set(false);
        // Back to the slow safety net once we're healthy again.
        if (this.pollMs !== KitchenComponent.POLL_MS) {
          this.pollMs = KitchenComponent.POLL_MS;
          this.schedule();
        }
        if (list === null) return; // 304: queue unchanged - nothing to do
        const isFirst = this.firstLoad();
        this.firstLoad.set(false);
        const sig = list.map((o: any) => `${o.id}:${o.createdAt}:${o.items?.length ?? 0}`).join('|');
        if (!isFirst && sig === this.lastSig) return; // same queue - no re-render, no chime
        this.lastSig = sig;
        if (!isFirst) {
          // Chime once per batch (a backlog after an outage is one alert, not a beep storm).
          const fresh = list.filter(o => !this.seen.has(o.id));
          if (fresh.length > 0) {
            this.newOrderId.set(fresh[0].id);
            this.sound.notification();
          }
          if (this.newOrderId()) setTimeout(() => this.newOrderId.set(null), 5000);
        }
        // Pending cards clear once the synced order shows up in the queue
        // (matched by item summary) or when they simply expire.
        const joined = (o: any) => (o.items ?? []).map((i: any) => `${i.quantity}×${i.name}`).join(', ');
        this.pendingSync.update(list2 => list2.filter(p =>
          Date.now() - p.at < KitchenComponent.PENDING_TTL && !list.some(o => joined(o) === p.summary)
        ));
        this.seen = new Set(list.map((o: any) => o.id));
        this.orders.set(list);
      },
      error: () => {
        this.firstLoad.set(false);
        this.offline.set(true);
        // Expire stale pending cards so the strip can't accumulate forever.
        this.pendingSync.update(l => l.filter(p => Date.now() - p.at < KitchenComponent.PENDING_TTL));
        // Tablet offline: retry fast so the moment the connection returns the
        // queue catches up (and chimes) within seconds, not minutes.
        if (this.pollMs !== KitchenComponent.RETRY_MS) {
          this.pollMs = KitchenComponent.RETRY_MS;
          this.schedule();
        }
      },
      complete: () => { this.inFlight = false; },
    });
  }

  complete(o: any) {
    this.service.completeOrder(o.id).subscribe({
      next: () => {
        this.orders.update(list => list.filter(x => x.id !== o.id));
        this.seen.delete(o.id);
      },
      error: () => { /* will retry on the next poll */ }
    });
  }
}
