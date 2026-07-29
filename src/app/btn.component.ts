import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-btn',
  standalone: true,
  template: `
    <button
      class="app-btn"
      [class.primary]="variant === 'primary'"
      [class.danger]="variant === 'danger'"
      [class.sm]="size === 'sm'"
      [class.block]="block"
      [class.loading]="loading"
      [disabled]="disabled || loading"
      (click)="onClick.emit($event)">
      @if (loading) {
        <span class="spinner"></span>
      }
      <ng-content />
    </button>
  `,
  styles: [`
    .app-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.4em;
      margin: 0;
      padding: 0.75em 1.8em;
      border: 0.125em solid var(--border);
      border-radius: 0.9375em;
      background: transparent;
      color: var(--text-2);
      font-family: inherit;
      font-size: 0.875rem;
      font-weight: 600;
      line-height: 1.3;
      cursor: pointer;
      outline: none;
      user-select: none;
      -webkit-user-select: none;
      touch-action: manipulation;
      transition: all 300ms cubic-bezier(.23, 1, 0.32, 1);
      white-space: nowrap;
    }
    .app-btn:hover:not(:disabled) {
      color: #fff;
      background: var(--text);
      border-color: var(--text);
      box-shadow: rgba(0,0,0,0.15) 0 6px 12px;
      transform: translateY(-2px);
    }
    .app-btn:active:not(:disabled) {
      box-shadow: none;
      transform: translateY(0);
    }
    .app-btn:disabled {
      pointer-events: none;
      opacity: 0.35;
    }

    /* Primary */
    .app-btn.primary {
      border-color: var(--accent-2);
      color: var(--accent-2);
    }
    .app-btn.primary:hover:not(:disabled) {
      background: var(--accent-2);
      border-color: var(--accent-2);
      color: #fff;
    }

    /* Danger */
    .app-btn.danger {
      border-color: var(--red);
      color: var(--red);
    }
    .app-btn.danger:hover:not(:disabled) {
      background: var(--red);
      border-color: var(--red);
      color: #fff;
    }

    /* Small */
    .app-btn.sm {
      padding: 0.45em 1.1em;
      font-size: 0.75rem;
    }

    /* Block / full width */
    .app-btn.block {
      width: 100%;
    }

    /* Loading */
    .app-btn.loading {
      opacity: 0.7;
    }
    .spinner {
      width: 1em;
      height: 1em;
      border: 2px solid currentColor;
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
      display: inline-block;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  `]
})
export class BtnComponent {
  @Input() variant: 'default' | 'primary' | 'danger' = 'default';
  @Input() size: 'default' | 'sm' = 'default';
  @Input() block = false;
  @Input() loading = false;
  @Input() disabled = false;
  @Output() onClick = new EventEmitter<MouseEvent>();
}
