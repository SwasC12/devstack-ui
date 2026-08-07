import { Component, Input } from '@angular/core';

// Vector CoffeeShop Pro logo (same mark as the app icon): steam + cup + saucer.
// Renders with currentColor, so the parent controls the tint (brand, muted, …).
@Component({
  selector: 'app-logo',
  standalone: true,
  templateUrl: './app-logo.component.html',})
export class AppLogoComponent {
  @Input() size = 28;
}
