import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MenuItemService } from '../../menu-item.service';
import { MenuItem } from '../../menu-item.model';

@Component({
  selector: 'app-customer-menu',
  standalone: true,
  imports: [CommonModule],
  template: `
    <h2 class="page-title">Menu</h2>

    @if (!items.length) {
      <p style="text-align:center;color:var(--muted);padding:3rem 0;">Loading menu…</p>
    }

    @for (cat of categories; track cat) {
      <section style="margin-bottom:2rem;">
        <h3 style="font-size:0.9375rem;font-weight:700;margin:0 0 0.75rem;color:var(--text);">{{ cat }}</h3>
        <div class="grid">
          @for (item of itemsByCat(cat); track item.id) {
            <div class="item" [class.sold]="!item.isAvailable">
              @if (item.imageUrl) {
                <img [src]="item.imageUrl" alt="" class="img" />
              } @else {
                <div class="img placeholder">☕</div>
              }
              <div class="body">
                <div class="top">
                  <span class="name">{{ item.name }}</span>
                  <span class="price">R{{ item.price | number:'1.2-2' }}</span>
                </div>
                @if (item.description) {
                  <p class="desc">{{ item.description }}</p>
                }
              </div>
              @if (!item.isAvailable) {
                <span class="badge">Sold out</span>
              }
            </div>
          }
        </div>
      </section>
    }
  `,
  styles: [`
    .grid { display: grid; grid-template-columns: repeat(auto-fill, 175px); gap: 0.75rem; }
    .item { position: relative; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow-sm); transition: box-shadow 0.15s; }
    .item:hover { box-shadow: var(--shadow-md); }
    .item.sold { opacity: 0.5; }
    .img { width: 100%; height: 110px; object-fit: cover; display: block; }
    .img.placeholder { display: flex; align-items: center; justify-content: center; font-size: 2.5rem; background: #f0e8de; }
    .body { padding: 0.625rem; }
    .top { display: flex; justify-content: space-between; align-items: baseline; gap: 0.375rem; }
    .name { font-size: 0.8125rem; font-weight: 700; }
    .price { font-size: 0.875rem; font-weight: 700; color: var(--accent); white-space: nowrap; }
    .desc { margin: 0.25rem 0 0; font-size: 0.6875rem; color: var(--muted); line-height: 1.4; }
    .badge { position: absolute; top: 6px; left: 6px; background: var(--red); color: #fff; font-size: 0.625rem; font-weight: 700; padding: 0.125rem 0.4rem; border-radius: 5px; }
  `]
})
export class CustomerMenuComponent implements OnInit {
  private service = inject(MenuItemService);
  items: MenuItem[] = [];

  get categories(): string[] { return [...new Set(this.items.map(i => i.category))].sort(); }
  itemsByCat(cat: string) { return this.items.filter(i => i.category === cat); }

  ngOnInit() { this.service.getItems().subscribe(items => this.items = items); }
}
