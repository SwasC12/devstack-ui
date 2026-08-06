import { Injectable, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

export type Theme = 'dark' | 'light';

const KEY = 'theme';

// App-wide theme: dark (default) or light. Choice is persisted per device and
// defaults to the system preference on first run.
@Injectable({ providedIn: 'root' })
export class ThemeService {
  theme = signal<Theme>('dark');

  constructor() {
    void this.init();
  }

  private async init(): Promise<void> {
    const { value } = await Preferences.get({ key: KEY });
    let t: Theme;
    if (value === 'light' || value === 'dark') {
      t = value;
    } else {
      t = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    this.apply(t);
  }

  set(t: Theme): void {
    this.apply(t);
    void Preferences.set({ key: KEY, value: t });
  }

  private apply(t: Theme): void {
    this.theme.set(t);
    document.documentElement.setAttribute('data-theme', t);
  }
}
