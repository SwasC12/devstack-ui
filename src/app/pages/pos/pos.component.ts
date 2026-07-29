import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MenuItemService } from '../../menu-item.service';
import { MenuItem } from '../../menu-item.model';
import { AuthService } from '../../auth.service';
import { Router } from '@angular/router';
import { BtnComponent } from '../../btn.component';

interface CartItem { id: number; name: string; price: number; quantity: number; }

@Component({
  selector: 'app-pos',
  standalone: true,
  imports: [CommonModule, FormsModule, BtnComponent],
  template: `
    <!-- Top bar -->
    <div class="pos-bar">
      <div class="pos-bar-left">
        <span class="pos-user">{{ auth.getUser()?.displayName }}</span>
        @if (shiftActive()) {
          <span class="shift-badge on">Shift on</span>
        } @else {
          <span class="shift-badge">Clocked out</span>
        }
      </div>
      <div class="pos-bar-right">
        @if (shiftActive()) {
          <app-btn size="sm" (onClick)="endShift()">End shift</app-btn>
        } @else {
          <app-btn size="sm" variant="primary" (onClick)="startShift()">Start shift</app-btn>
        }
        <app-btn size="sm" (onClick)="showSettings.set(!showSettings())">Settings</app-btn>
      </div>
    </div>

    <!-- Settings panel -->
    @if (showSettings()) {
      <div class="settings card">
        <h3>Change password</h3>
        <div class="pw-row">
          <input type="password" [(ngModel)]="pwCurrent" placeholder="Current password" />
          <input type="password" [(ngModel)]="pwNew" placeholder="New password" />
          <button class="btn btn-sm btn-primary" (click)="changePw()" [disabled]="!pwCurrent || !pwNew">
            {{ pwBusy() ? 'Saving…' : 'Update' }}
          </button>
        </div>
        @if (pwMsg()) { <p class="pw-msg">{{ pwMsg() }}</p> }
      </div>
    }

    <!-- Main POS layout -->
    <div class="pos-layout">
      <div class="pos-menu">
        <div class="categories">
          @for (cat of categories; track cat) {
            <button class="cat-chip" [class.active]="cat === activeCat" (click)="activeCat = cat">{{ cat }}</button>
          }
        </div>
        <div class="items">
          @for (item of filtered(); track item.id) {
            <button class="item" [class.sold]="!item.isAvailable || item.stockQuantity < 1"
              (click)="addToCart(item)" [disabled]="!item.isAvailable || item.stockQuantity < 1">
              @if (item.imageUrl) { <img [src]="item.imageUrl" alt="" class="item-img" /> }
              @else { <div class="item-img placeholder">☕</div> }
              <div class="item-body">
                <span class="item-name">{{ item.name }}</span>
                <span class="item-price">R{{ item.price | number:'1.2-2' }}</span>
              </div>
              @if (!item.isAvailable || item.stockQuantity < 1) { <span class="item-badge">Sold out</span> }
            </button>
          }
        </div>
      </div>

      <!-- Cart -->
      <div class="cart">
        <div class="cart-head">
          <h2 class="cart-title">Current order</h2>
          @if (cart().length) { <span class="cart-count">{{ cart().length }} item{{ cart().length !== 1 ? 's' : '' }}</span> }
        </div>
        <div class="cart-items">
          @if (cart().length === 0) {
            <div class="cart-empty"><span style="font-size:2rem;">🛒</span><p>Tap items to add them here.</p></div>
          }
          @for (ci of cart(); track ci.id) {
            <div class="cart-row">
              <div class="cart-info">
                <span class="cart-name">{{ ci.name }}</span>
                <span class="cart-unit">R{{ ci.price | number:'1.2-2' }} ea</span>
              </div>
              <div class="cart-qty">
                <button class="qty-btn" (click)="updateQty(ci.id, -1)">−</button>
                <span class="qty-val">{{ ci.quantity }}</span>
                <button class="qty-btn" (click)="updateQty(ci.id, 1)">+</button>
              </div>
              <span class="cart-total">R{{ (ci.price * ci.quantity) | number:'1.2-2' }}</span>
            </div>
          }
        </div>
        <div class="cart-foot">
          <div class="cart-summary"><span>Total</span><strong>R{{ total() | number:'1.2-2' }}</strong></div>
          <app-btn variant="primary" [block]="true" [disabled]="cart().length === 0" [loading]="busy()" (onClick)="checkout()">
            Place order · R{{ total() | number:'1.2-2' }}
          </app-btn>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .pos-bar { display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; margin-bottom: 0.75rem; }
    .pos-bar-left { display: flex; align-items: center; gap: 0.75rem; }
    .pos-user { font-weight: 700; font-size: 0.9rem; color: var(--accent-2); }
    .shift-badge { font-size: 0.7rem; font-weight: 700; padding: 0.15rem 0.5rem; border-radius: 100px; background: var(--muted); color: #fff; }
    .shift-badge.on { background: var(--green); }
    .pos-bar-right { display: flex; gap: 0.375rem; }
    .settings { padding: 0.75rem 1rem; margin-bottom: 0.75rem; }
    .settings h3 { margin: 0 0 0.5rem; font-size: 0.8125rem; }
    .pw-row { display: flex; gap: 0.5rem; align-items: flex-end; }
    .pw-row input { padding: 0.45rem 0.65rem; border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem; font-family: inherit; outline: none; width: 160px; }
    .pw-row input:focus { border-color: var(--accent); }
    .pw-msg { margin: 0.5rem 0 0; font-size: 0.78rem; color: var(--green); }
    .pos-layout { display: flex; gap: 1.5rem; height: calc(100vh - 180px); }
    .pos-menu { flex: 1; display: flex; flex-direction: column; min-width: 0; }
    .categories { display: flex; gap: 0.375rem; padding-bottom: 0.75rem; overflow-x: auto; flex-shrink: 0; }
    .cat-chip { padding: 0.55em 1.2em; border-radius: 2em; border: 0.125em solid var(--border); background: transparent; color: var(--text-2); font-size: 0.8125rem; font-weight: 600; cursor: pointer; white-space: nowrap; font-family: inherit; transition: all 300ms cubic-bezier(.23, 1, 0.32, 1); }
    .cat-chip:hover { border-color: var(--accent-2); color: var(--accent-2); transform: translateY(-1px); }
    .cat-chip.active { background: var(--accent-2); border-color: var(--accent-2); color: #fff; }
    .items { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 0.75rem; overflow-y: auto; align-content: start; padding-bottom: 1rem; }
    .item { position: relative; display: flex; flex-direction: column; border-radius: var(--radius); overflow: hidden; border: 1.5px solid var(--border); background: var(--surface); cursor: pointer; transition: all 0.12s; padding: 0; box-shadow: var(--shadow-sm); }
    .item:hover:not(:disabled) { border-color: var(--accent); box-shadow: var(--shadow-md); transform: translateY(-2px); }
    .item:active:not(:disabled) { transform: scale(0.97); }
    .item.sold { opacity: 0.45; }
    .item:disabled { cursor: default; }
    .item-img { width: 100%; height: 110px; object-fit: cover; display: block; background: #f0e8de; }
    .item-img.placeholder { display: flex; align-items: center; justify-content: center; font-size: 2.5rem; }
    .item-body { padding: 0.625rem; display: flex; flex-direction: column; gap: 0.125rem; }
    .item-name { font-size: 0.8125rem; font-weight: 700; line-height: 1.3; }
    .item-price { font-size: 0.9375rem; font-weight: 700; color: var(--accent); }
    .item-badge { position: absolute; top: 6px; left: 6px; background: var(--red); color: #fff; font-size: 0.625rem; font-weight: 700; padding: 0.125rem 0.4rem; border-radius: 5px; }
    .cart { width: 340px; flex-shrink: 0; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-md); display: flex; flex-direction: column; overflow: hidden; }
    .cart-head { padding: 1rem 1.25rem; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
    .cart-title { margin: 0; font-size: 0.9375rem; font-weight: 700; color: var(--text); }
    .cart-count { font-size: 0.75rem; color: var(--muted); font-weight: 600; }
    .cart-items { flex: 1; overflow-y: auto; padding: 0.25rem 1.25rem; }
    .cart-empty { text-align: center; padding: 2.5rem 0; color: var(--muted); font-size: 0.8125rem; }
    .cart-empty p { margin: 0.5rem 0 0; }
    .cart-row { display: flex; align-items: center; gap: 0.75rem; padding: 0.625rem 0; border-bottom: 1px solid var(--border); }
    .cart-row:last-child { border: 0; }
    .cart-info { flex: 1; min-width: 0; }
    .cart-name { font-size: 0.8125rem; font-weight: 700; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cart-unit { font-size: 0.6875rem; color: var(--muted); }
    .cart-qty { display: flex; align-items: center; gap: 0.375rem; flex-shrink: 0; }
    .qty-btn { width: 32px; height: 32px; border: 0.125em solid var(--border); border-radius: 0.5em; background: transparent; cursor: pointer; font-size: 0.9rem; font-weight: 700; display: flex; align-items: center; justify-content: center; color: var(--text-2); transition: all 300ms cubic-bezier(.23, 1, 0.32, 1); }
    .qty-btn:hover { background: var(--text); border-color: var(--text); color: #fff; }
    .qty-val { font-weight: 700; min-width: 1.5rem; text-align: center; font-size: 0.875rem; }
    .cart-total { font-weight: 700; min-width: 4.5rem; text-align: right; font-size: 0.875rem; font-variant-numeric: tabular-nums; }
    .cart-foot { padding: 1rem 1.25rem; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 0.75rem; background: var(--surface-2); }
    .cart-summary { display: flex; justify-content: space-between; align-items: baseline; font-size: 1.05rem; }
    .cart-summary strong { font-size: 1.25rem; color: var(--accent-2); }
  `]
})
export class PosComponent implements OnInit {
  private service = inject(MenuItemService);
  auth = inject(AuthService);
  private router = inject(Router);

  // Items & cart
  items: MenuItem[] = [];
  readonly cart = signal<CartItem[]>([]);
  readonly busy = signal(false);
  activeCat = 'Hot Drinks';

  // Shift
  readonly shiftActive = signal(false);

  // Settings / password
  readonly showSettings = signal(false);
  pwCurrent = ''; pwNew = ''; readonly pwBusy = signal(false); readonly pwMsg = signal('');

  get categories(): string[] { return [...new Set(this.items.map(i => i.category))].sort(); }
  readonly filtered = () => this.items.filter(i => i.category === this.activeCat);
  readonly total = () => this.cart().reduce((s, i) => s + i.price * i.quantity, 0);

  ngOnInit() { this.load(); this.checkShift(); }

  private load() { this.service.getItems().subscribe(items => this.items = items); }
  private checkShift() { this.service.getActiveShift().subscribe(s => this.shiftActive.set(s.active)); }

  startShift() { this.service.startShift().subscribe(() => this.shiftActive.set(true)); }
  endShift() { this.service.endShift().subscribe(() => this.shiftActive.set(false)); }

  changePw() {
    this.pwBusy.set(true); this.pwMsg.set('');
    this.service.changePassword(this.pwCurrent, this.pwNew).subscribe({
      next: () => { this.pwMsg.set('Password updated.'); this.pwCurrent = ''; this.pwNew = ''; this.pwBusy.set(false); },
      error: (e) => { this.pwMsg.set(e.error?.error || 'Failed'); this.pwBusy.set(false); }
    });
  }

  addToCart(item: MenuItem) {
    this.cart.update(c => {
      const exist = c.find(i => i.id === item.id);
      return exist ? c.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i)
        : [...c, { id: item.id, name: item.name, price: item.price, quantity: 1 }];
    });
  }

  updateQty(id: number, delta: number) {
    this.cart.update(c => c.map(i => i.id === id ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i).filter(i => i.quantity > 0));
  }

  checkout() {
    if (this.cart().length === 0) return;
    this.busy.set(true);
    this.service.placeOrder(this.cart()).subscribe({
      next: () => { this.cart.set([]); this.busy.set(false); this.load(); },
      error: () => { this.busy.set(false); alert('Checkout failed'); }
    });
  }
}
