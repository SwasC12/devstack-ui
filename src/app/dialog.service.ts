import { Injectable, signal } from '@angular/core';

export type ToastType = 'info' | 'success' | 'error';

export type DialogState =
  | { kind: 'toast'; type: ToastType; message: string }
  | { kind: 'alert'; title: string; message: string; resolve: (v: void) => void }
  | { kind: 'confirm'; title: string; message: string; resolve: (v: boolean) => void }
  | { kind: 'prompt'; title: string; message: string; inputType: 'pin' | 'text'; placeholder: string; resolve: (v: string | null) => void }
  | { kind: 'reveal'; title: string; message: string; value: string; resolve: (v: void) => void };

// Native-style feedback instead of browser alert()/confirm()/prompt().
// Rendered by <app-dialog /> (mounted once in the app shell).
@Injectable({ providedIn: 'root' })
export class DialogService {
  readonly state = signal<DialogState | null>(null);
  private toastTimer: any;

  // Snackbar-style notification (auto-dismisses).
  toast(message: string, type: ToastType = 'info') {
    clearTimeout(this.toastTimer);
    this.state.set({ kind: 'toast', type, message });
    this.toastTimer = setTimeout(() => {
      if (this.state()?.kind === 'toast') this.state.set(null);
    }, 3200);
  }

  alert(title: string, message: string): Promise<void> {
    return new Promise(resolve => this.state.set({ kind: 'alert', title, message, resolve }));
  }

  confirm(title: string, message: string): Promise<boolean> {
    return new Promise(resolve => this.state.set({ kind: 'confirm', title, message, resolve }));
  }

  prompt(title: string, message: string, opts?: { inputType?: 'pin' | 'text'; placeholder?: string }): Promise<string | null> {
    return new Promise(resolve => this.state.set({
      kind: 'prompt', title, message,
      inputType: opts?.inputType ?? 'pin',
      placeholder: opts?.placeholder ?? '••••',
      resolve
    }));
  }

  // Show a one-time secret (e.g. a freshly reset password) with a copy button.
  reveal(title: string, message: string, value: string): Promise<void> {
    return new Promise(resolve => this.state.set({ kind: 'reveal', title, message, value, resolve }));
  }

  close(value?: unknown) {
    const s = this.state();
    if (s && s.kind !== 'toast') s.resolve(value as never);
    this.state.set(null);
  }
}
