import { Component, EventEmitter, Input, Output, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

// Password / PIN input with a show-hide toggle (eye). Works with [(ngModel)]
// via ControlValueAccessor, and re-emits Enter for forms that submit on it.
@Component({
  selector: 'app-password',
  standalone: true,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => PasswordInputComponent), multi: true }],
  template: `
    <div class="pw" [class.pin]="pin">
      <input
        class="pw-input"
        [type]="show ? 'text' : 'password'"
        [placeholder]="placeholder"
        [attr.maxlength]="maxlength ?? null"
        [attr.inputmode]="inputmode ?? null"
        [attr.autocomplete]="autocomplete"
        [value]="value"
        (input)="onInput($event)"
        (keyup.enter)="enter.emit()" />
      <button type="button" class="eye" (click)="toggle()" [attr.aria-label]="show ? 'Hide' : 'Show'">
        @if (show) {
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>
          </svg>
        } @else {
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
          </svg>
        }
      </button>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .pw { position: relative; display: flex; align-items: center; }
    .pw-input {
      width: 100%;
      padding: 0.6rem 2.6rem 0.6rem 0.75rem;
      border: 1px solid var(--border-hover);
      border-radius: var(--radius-sm);
      font-size: 0.875rem;
      font-family: inherit;
      color: var(--text);
      background: var(--surface-2);
      outline: none;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .pw-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(200, 135, 56, 0.15); }
    .pw-input::placeholder { color: var(--muted); }
    .pw.pin .pw-input { text-align: center; font-size: 1.25rem; letter-spacing: 0.5em; font-weight: 700; }
    .eye {
      position: absolute;
      right: 0.4rem;
      top: 50%;
      transform: translateY(-50%);
      background: transparent;
      border: 0;
      cursor: pointer;
      color: var(--muted);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0.45rem;
      border-radius: var(--radius-sm);
      transition: all 0.15s ease-out;
    }
    .eye:hover { color: var(--text); background: var(--surface-3); }
    .eye svg { width: 18px; height: 18px; }
  `]
})
export class PasswordInputComponent implements ControlValueAccessor {
  @Input() placeholder = '';
  @Input() pin = false;              // centered + spaced (PIN pad look)
  @Input() maxlength: number | null = null;
  @Input() inputmode: string | null = null;
  @Input() autocomplete = 'off';
  @Output() enter = new EventEmitter<void>();

  show = false;
  value = '';
  private onChange: (v: string) => void = () => {};
  private onTouched: () => void = () => {};

  toggle() { this.show = !this.show; }

  onInput(e: Event) {
    const v = (e.target as HTMLInputElement).value;
    this.value = v;
    this.onChange(v);
    this.onTouched();
  }

  writeValue(v: string) { this.value = v ?? ''; }
  registerOnChange(fn: (v: string) => void) { this.onChange = fn; }
  registerOnTouched(fn: () => void) { this.onTouched = fn; }
}
