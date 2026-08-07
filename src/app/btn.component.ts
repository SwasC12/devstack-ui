import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-btn',
  standalone: true,
  templateUrl: './btn.component.html',
  styleUrl: './btn.component.scss',
})
export class BtnComponent {
  @Input() variant: 'default' | 'primary' | 'danger' = 'default';
  @Input() size: 'default' | 'sm' = 'default';
  @Input() block = false;
  @Input() loading = false;
  @Input() disabled = false;
  @Output() onClick = new EventEmitter<MouseEvent>();
}
