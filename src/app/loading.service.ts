import { Injectable, signal } from '@angular/core';

// Global loading state, driven by a counter so concurrent requests keep the
// loader visible until the LAST one finishes. Auto-wired into the HTTP
// interceptor and router navigation; any component can also call show()/hide()
// around manual work (e.g. a button that kicks off a slow local operation).
@Injectable({ providedIn: 'root' })
export class LoadingService {
  private counter = 0;
  readonly visible = signal(false);

  show(): void {
    this.counter++;
    this.visible.set(true);
  }

  hide(): void {
    this.counter = Math.max(0, this.counter - 1);
    if (this.counter === 0) this.visible.set(false);
  }

  // Run a task under the loader without juggling show/hide yourself.
  async run<T>(task: Promise<T>): Promise<T> {
    this.show();
    try {
      return await task;
    } finally {
      this.hide();
    }
  }
}
