import { Component, Input } from '@angular/core';

// Vector CoffeeShop Pro logo (same mark as the app icon): steam + cup + saucer.
// Renders with currentColor, so the parent controls the tint (brand, muted, …).
@Component({
  selector: 'app-logo',
  standalone: true,
  template: `
    <svg [attr.width]="size" [attr.height]="size" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M18.5 17.5c-1.6-2.6.4-4.6-1.4-7" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" opacity="0.85"/>
      <path d="M24 17.5V10" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" opacity="0.85"/>
      <path d="M29.5 17.5c1.6-2.6-.4-4.6 1.4-7" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" opacity="0.85"/>
      <path d="M36.5 24a7.5 7.5 0 0 1 0 12" stroke="currentColor" stroke-width="3.6" stroke-linecap="round"/>
      <rect x="11.5" y="19.5" width="25" height="18" rx="4.5" fill="currentColor"/>
      <ellipse cx="24" cy="40.5" rx="14.5" ry="2.8" fill="currentColor"/>
      <ellipse cx="24" cy="44" rx="8" ry="1.6" fill="currentColor" opacity="0.5"/>
    </svg>
  `
})
export class AppLogoComponent {
  @Input() size = 28;
}
