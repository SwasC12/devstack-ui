import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Capacitor } from '@capacitor/core';
import { MenuItemService } from '../../menu-item.service';
import { SoundService } from '../../sound.service';

// Kitchen display: a second tablet (same app, Kitchen tab) shows the live
// order queue. Instant updates arrive via the LAN webhook (the POS pings this
// tablet's local server after checkout - zero server traffic, zero FCM quota);
// a slow 5-minute poll is only the safety net for a missed ping. "Done"
// removes an order from the queue (it stays in revenue).
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

  private timer: ReturnType<typeof setInterval> | null = null;
  private seen = new Set<number>();
  private serverHandle: any = null;

  ngOnInit() {
    void this.refresh(true);
    // Safety-net poll only (5 min). Real-time comes from the LAN webhook.
    this.timer = setInterval(() => void this.refresh(), 300000);
    void this.listenForWebhook();
  }

  ngOnDestroy() {
    if (this.timer) clearInterval(this.timer);
    try { this.serverHandle?.remove(); } catch { /* ignore */ }
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

  private refresh(first = false) {
    this.service.getKitchenOrders(120).subscribe({
      next: (list) => {
        if (!first) {
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
        this.lastRefresh.set(new Date());
      },
      error: () => { /* tablet offline - keep showing the last known queue */ }
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
