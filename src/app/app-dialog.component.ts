import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DialogService, DialogState } from './dialog.service';

// Themed native-style dialogs: snackbar toasts + modal alert/confirm/prompt.
// Mounted once in the app shell; driven entirely by DialogService.
@Component({
  selector: 'app-dialog',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './app-dialog.component.html',
  styleUrl: './app-dialog.component.scss',
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
