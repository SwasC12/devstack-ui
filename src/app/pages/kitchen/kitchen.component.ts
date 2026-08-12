import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Capacitor } from '@capacitor/core';
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
    // Safety-net poll only (5 min). Real-time comes from the LAN webhook.
    this.timer = setInterval(() => void this.refresh(), 300000);
    void this.listenForWebhook();
    this.watchAppState();
  }

  ngOnDestroy() {
    if (this.timer) clearInterval(this.timer);
    try { this.serverHandle?.remove(); } catch { /* ignore */ }
    try { this.appHandle?.remove(); } catch { /* ignore */ }
    try { (Capacitor as any).Plugins?.KitchenServer?.stop(); } catch { /* ignore */ }
  }

  // The POS pings this tablet's local server (KitchenServerPlugin, port 8123)
  // after every checkout - refresh instantly when that lands.
  private async listenForWebhook() {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const plugin = (Capacitor as any).Plugins?.KitchenServer;
      if (!plugin) return;
      await plugin.start();
      this.serverHandle = await plugin.addListener('order', () => void this.refresh());
    } catch { /* webhook unavailable - poll still covers it */ }
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
        if (list === null) return; // 304: queue unchanged - nothing to do
        const isFirst = this.firstLoad();
        this.firstLoad.set(false);
        const sig = list.map((o: any) => `${o.id}:${o.createdAt}:${o.items?.length ?? 0}`).join('|');
        if (!isFirst && sig === this.lastSig) return; // same queue - no re-render, no chime
        this.lastSig = sig;
        if (!isFirst) {
          for (const o of list) {
            if (!this.seen.has(o.id)) {
              this.newOrderId.set(o.id);
              this.sound.notification();
            }
          }
          if (this.newOrderId()) setTimeout(() => this.newOrderId.set(null), 5000);
        }
        this.seen = new Set(list.map((o: any) => o.id));
        this.orders.set(list);
      },
      error: () => {
        this.firstLoad.set(false);
        // tablet offline - keep showing the last known queue
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
