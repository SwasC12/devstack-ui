import { Component, Input } from '@angular/core';

/**
 * Reusable presentational card. Drop any markup between the tags:
 *
 *   <app-display-card>
 *     <h3>Anything</h3>
 *   </app-display-card>
 *
 * Set `shadow` to false for the flat variant.
 */
@Component({
  selector: 'app-display-card',
  standalone: true,
  templateUrl: './display-card.component.html',
  styleUrl: './display-card.component.scss',
})
export class DisplayCardComponent {
  /** Applies the inset + drop shadow treatment. On by default. */
  @Input() shadow = true;
}
