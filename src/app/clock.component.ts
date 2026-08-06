import { Component, OnDestroy, OnInit } from '@angular/core';

// Live clock for the POS/cashier and admin screens - the Android status bar
// is hidden in fullscreen mode, so the time lives in the app itself.
@Component({
  selector: 'app-clock',
  standalone: true,
  template: `<span class="clock">{{ time }}</span>`,
  styles: [
    `
      .clock {
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--text-2);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
        letter-spacing: 0.02em;
      }
    `,
  ],
})
export class ClockComponent implements OnInit, OnDestroy {
  time = '';
  private timer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.tick();
    this.timer = setInterval(() => this.tick(), 1000);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private tick(): void {
    this.time = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }
}
