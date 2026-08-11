import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MenuItemService } from '../../menu-item.service';
import { SoundService } from '../../sound.service';

// Kitchen display: a second tablet (same app, Kitchen tab) shows the live
// order queue - polls every 5s, no ticket printing needed. "Done" removes an
// order from the queue (it stays in revenue). A chime plays when a new order
// lands and the card flashes so the bar never misses one.
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

  ngOnInit() {
    void this.refresh(true);
    this.timer = setInterval(() => void this.refresh(), 5000);
  }

  ngOnDestroy() {
    if (this.timer) clearInterval(this.timer);
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
