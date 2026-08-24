import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

// Single inline-SVG icon component. Replaces the emoji glyphs that were used as
// UI chrome (bell, printer, cart, close, chevrons, checks, etc.) with crisp,
// theme-aware line icons that inherit the current text colour via
// stroke="currentColor". Usage: <app-icon name="bell" [size]="18" />
//
// The shapes live directly in the SVG template (not via [innerHTML], which
// Angular's HTML sanitizer would strip SVG children from). Feather/Lucide-style
// 24x24, 2px stroke. Add new icons with another @case block.
@Component({
  selector: 'app-icon',
  standalone: true,
  imports: [CommonModule],
  template: `<svg [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" [attr.stroke-width]="strokeWidth" stroke-linecap="round" stroke-linejoin="round"
      class="app-icon" aria-hidden="true" [ngSwitch]="name">
    <ng-container *ngSwitchCase="'close'"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></ng-container>
    <ng-container *ngSwitchCase="'check'"><polyline points="20 6 9 17 4 12"/></ng-container>
    <ng-container *ngSwitchCase="'search'"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></ng-container>
    <ng-container *ngSwitchCase="'plus'"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></ng-container>
    <ng-container *ngSwitchCase="'trash'"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></ng-container>
    <ng-container *ngSwitchCase="'chevron-down'"><polyline points="6 9 12 15 18 9"/></ng-container>
    <ng-container *ngSwitchCase="'chevron-up'"><polyline points="18 15 12 9 6 15"/></ng-container>
    <ng-container *ngSwitchCase="'chevron-right'"><polyline points="9 18 15 12 9 6"/></ng-container>
    <ng-container *ngSwitchCase="'chevron-left'"><polyline points="15 18 9 12 15 6"/></ng-container>
    <ng-container *ngSwitchCase="'bell'"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></ng-container>
    <ng-container *ngSwitchCase="'printer'"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></ng-container>
    <ng-container *ngSwitchCase="'package'"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></ng-container>
    <ng-container *ngSwitchCase="'cart'"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></ng-container>
    <ng-container *ngSwitchCase="'coffee'"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></ng-container>
    <ng-container *ngSwitchCase="'store'"><path d="M3 9l1.5-5.5A1 1 0 0 1 5.46 3h13.08a1 1 0 0 1 .96.5L21 9"/><path d="M4 9v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/></ng-container>
    <ng-container *ngSwitchCase="'key'"><circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.5 12.5L20 3"/><path d="M17 6l3 3"/><path d="M14 9l3 3"/></ng-container>
    <ng-container *ngSwitchCase="'megaphone'"><path d="M3 11l18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></ng-container>
    <ng-container *ngSwitchCase="'warning'"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></ng-container>
    <ng-container *ngSwitchCase="'bulb'"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5.76.76 1.23 1.52 1.41 2.5"/></ng-container>
    <ng-container *ngSwitchCase="'party'"><path d="M2 22l4-12 8 8-12 4z"/><path d="M14 6l1.5-1.5"/><path d="M18 2l-2 2"/><path d="M20 8l-2-1"/><path d="M12 4l1 2"/></ng-container>
    <ng-container *ngSwitchCase="'qr-code'"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="5" y="5" width="3" height="3"/><rect x="16" y="5" width="3" height="3"/><rect x="5" y="16" width="3" height="3"/><rect x="16" y="16" width="3" height="3"/></ng-container>
  </svg>`,
  styles: [`:host { display: inline-flex; align-items: center; justify-content: center; line-height: 0; }
    .app-icon { display: block; }`],
})
export class IconComponent {
  @Input() name = '';
  @Input() size: number | string = 18;
  @Input() strokeWidth: number | string = 2;
}
