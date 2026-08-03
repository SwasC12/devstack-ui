import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DialogService, DialogState } from './dialog.service';

// Themed native-style dialogs: snackbar toasts + modal alert/confirm/prompt.
// Mounted once in the app shell; driven entirely by DialogService.
@Component({
  selector: 'app-dialog',
  standalone: true,
  imports: [FormsModule],
  template: `
    @if (state(); as s) {
      @switch (s.kind) {
        @case ('toast') {
          <div class="toast" [class.err]="s.type === 'error'" [class.ok]="s.type === 'success'">
            {{ s.message }}
          </div>
        }
        @default {
          <div class="scrim" (click)="cancel()">
            <div class="panel" (click)="$event.stopPropagation()">
              <h3 class="panel-title">{{ s.title }}</h3>
              <p class="panel-msg">{{ s.message }}</p>
              @if (s.kind === 'prompt') {
                <input class="panel-input" [class.reveal]="s.inputType === 'text'"
                  [type]="s.inputType === 'pin' ? 'password' : 'text'"
                  [attr.inputmode]="s.inputType === 'pin' ? 'numeric' : null"
                  [maxlength]="s.inputType === 'pin' ? 6 : null"
                  [(ngModel)]="promptValue" (keyup.enter)="ok()" autocomplete="off" [placeholder]="s.placeholder" />
              }
              @if (s.kind === 'reveal') {
                <div class="reveal-row">
                  <input class="panel-input reveal" [value]="s.value" readonly (focus)="onRevealFocus($event)" />
                  <button type="button" class="btn ghost copy" (click)="copyReveal(s.value)">{{ copied() ? 'Copied ✓' : 'Copy' }}</button>
                </div>
              }
              <div class="panel-actions">
                @if (s.kind !== 'alert' && s.kind !== 'reveal') {
                  <button type="button" class="btn ghost" (click)="cancel()">Cancel</button>
                }
                <button type="button" class="btn primary" (click)="ok()">
                  {{ s.kind === 'confirm' ? 'Delete' : s.kind === 'prompt' ? 'Set' : 'Done' }}
                </button>
              </div>
            </div>
          </div>
        }
      }
    }
  `,
  styles: [`
    :host { display: contents; }

    /* ── Toast (snackbar) ── */
    .toast {
      position: fixed;
      bottom: 28px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 1000;
      background: var(--surface-2);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 0.8rem 1.25rem;
      font-size: 0.875rem;
      font-weight: 600;
      box-shadow: var(--shadow-lg);
      animation: rise 0.18s ease-out;
      max-width: min(90vw, 480px);
    }
    .toast.err { background: var(--red); border-color: var(--red); color: #fff; }
    .toast.ok { background: var(--green); border-color: var(--green); color: #fff; }

    /* ── Modal ── */
    .scrim {
      position: fixed;
      inset: 0;
      background: rgba(10, 8, 6, 0.65);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 900;
      animation: fade 0.15s ease-out;
    }
    .panel {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 1.75rem;
      width: 360px;
      max-width: 90vw;
      box-shadow: var(--shadow-lg);
      animation: pop 0.18s ease-out;
    }
    .panel-title { margin: 0 0 0.4rem; font-size: 1.0625rem; font-weight: 700; color: var(--text); }
    .panel-msg { margin: 0 0 1.25rem; font-size: 0.875rem; color: var(--text-2); line-height: 1.45; }
    .panel-input {
      width: 100%;
      margin-bottom: 1.25rem;
      padding: 0.6rem 0.75rem;
      text-align: center;
      font-size: 1.25rem;
      letter-spacing: 0.5em;
      font-weight: 700;
      border: 1px solid var(--border-hover);
      border-radius: var(--radius-sm);
      color: var(--text);
      background: var(--surface-2);
      outline: none;
    }
    .panel-input:focus { border-color: var(--accent); }
    .panel-input.reveal { letter-spacing: 0.06em; font-size: 1rem; user-select: all; }
    .reveal-row { position: relative; margin-bottom: 1.25rem; }
    .reveal-row .copy { position: absolute; right: 0.35rem; top: 50%; transform: translateY(-50%); padding: 0.4em 0.8em; font-size: 0.75rem; }
    .panel-actions { display: flex; gap: 0.625rem; justify-content: flex-end; }
    .btn {
      padding: 0.65em 1.5em;
      border: 0;
      border-radius: var(--radius-sm);
      font-family: inherit;
      font-size: 0.875rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.15s ease-out;
    }
    .btn.ghost { background: var(--surface-2); color: var(--text-2); }
    .btn.ghost:hover { background: var(--surface-3); color: var(--text); }
    .btn.primary { background: var(--accent); color: #fff; }
    .btn.primary:hover { background: var(--accent-hover); }

    @keyframes rise { from { transform: translate(-50%, 12px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
    @keyframes pop { from { transform: scale(0.94); opacity: 0; } to { transform: scale(1); opacity: 1; } }
    @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
  `]
})
export class AppDialogComponent {
  private dialog = inject(DialogService);
  state = this.dialog.state;
  promptValue = '';
  readonly copied = signal(false);
  private copyTimer: any;

  constructor() {
    // Clear the prompt input each time a new prompt opens.
    effect(() => { if (this.dialog.state()?.kind === 'prompt') this.promptValue = ''; });
  }

  onRevealFocus(e: Event) { (e.target as HTMLInputElement).select(); }

  copyReveal(value: string) {
    navigator.clipboard?.writeText(value).then(() => {
      this.copied.set(true);
      clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => this.copied.set(false), 2000);
    }).catch(() => { /* clipboard unavailable — user can still select the text */ });
  }

  ok() {
    const s: DialogState | null = this.dialog.state();
    if (!s) return;
    if (s.kind === 'confirm') this.dialog.close(true);
    else if (s.kind === 'prompt') this.dialog.close(this.promptValue);
    else this.dialog.close();
  }

  cancel() {
    const s: DialogState | null = this.dialog.state();
    if (!s || s.kind === 'toast') return;
    if (s.kind === 'confirm') this.dialog.close(false);
    else if (s.kind === 'prompt') this.dialog.close(null);
    else this.dialog.close();
  }
}
