import { Component, EventEmitter, Input, Output, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

// Password / PIN input with a show-hide toggle (eye). Works with [(ngModel)]
// via ControlValueAccessor, and re-emits Enter for forms that submit on it.
@Component({
  selector: 'app-password',
  standalone: true,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => PasswordInputComponent), multi: true }],
  templateUrl: './password-input.component.html',
  styleUrl: './password-input.component.scss',
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
