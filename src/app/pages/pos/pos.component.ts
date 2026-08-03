import { Component, effect, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { MenuItemService } from '../../menu-item.service';
import { MenuItem } from '../../menu-item.model';
import { AuthService } from '../../auth.service';
import { BtnComponent } from '../../btn.component';
import { DialogService } from '../../dialog.service';
import { ReceiptViewComponent } from '../../receipt-view.component';

interface CartItem { id: number; name: string; price: number; quantity: number; }

@Component({
  selector: 'app-pos',
  standalone: true,
  imports: [CommonModule, FormsModule, BtnComponent, ReceiptViewComponent],
  template: `
    <!-- Not on shift: one big, obvious clock-in screen. No POS until you're in. -->
    @if (!shiftActive()) {
      <div class="clockin">
        <div class="clockin-card">
          @if (shopInfo()?.logoUrl) { <img [src]="shopInfo()?.logoUrl" alt="" class="clockin-logo" /> }
          @else { <div class="clockin-logo placeholder">☕</div> }
          <h2>{{ auth.getUser()?.displayName }}</h2>
          <p class="clockin-sub">{{ shopInfo()?.name || 'CoffeeShop Pro' }}</p>
          <button class="btn-start" (click)="startShift()" [disabled]="startingShift()">
            {{ startingShift() ? 'Starting…' : 'Start shift' }}
          </button>
          <!-- Handover: the next cashier taps here → straight to PIN sign-in -->
          <button class="btn-switch" (click)="switchUser()">Switch user</button>
        </div>
      </div>
    } @else {
      <!-- Top bar: logo · search · end shift -->
      <div class="pos-bar">
        <div class="pos-bar-left">
          @if (shopInfo()?.logoUrl) { <img [src]="shopInfo()?.logoUrl" alt="" class="pos-logo" /> }
          <div class="pos-user-wrap">
            <span class="pos-user">{{ auth.getUser()?.displayName }}</span>
            <span class="shift-badge on">Shift on</span>
          </div>
        </div>
        <div class="pos-search">
          <span class="search-ic">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>
          </span>
          <input [(ngModel)]="search" (ngModelChange)="onSearch()" placeholder="Search drinks…" />
        </div>
        <div class="pos-bar-right">
          <app-btn size="sm" (onClick)="endShift()">End shift</app-btn>
        </div>
      </div>

      <!-- Order complete -->
      @if (complete()) {
        <div class="complete">
          <div class="complete-card">
            <span class="complete-check">✓</span>
            <strong>Order Complete</strong>
          </div>
        </div>
      }

      <!-- Main POS layout: categories · products · current order -->
      <div class="pos-layout">
        <aside class="cats">
          @for (cat of categories; track cat) {
            <button class="cat-btn" [class.active]="cat === activeCat" (click)="activeCat = cat">{{ cat }}</button>
          }
        </aside>

        <div class="pos-menu">
          @if (searching()) {
            <p class="results-hint">{{ filtered().length }} result{{ filtered().length === 1 ? '' : 's' }} for “{{ query() }}”</p>
          }
          @if (loading()) {
            <div class="items">
              @for (s of skeletonCards(); track s) {
                <div class="item skel">
                  <div class="item-img shimmer"></div>
                  <div class="item-body">
                    <span class="sk-line shimmer" style="width:70%"></span>
                    <span class="sk-line shimmer" style="width:40%"></span>
                  </div>
                </div>
              }
            </div>
          } @else {
          <div class="items">
            @for (item of filtered(); track item.id) {
              <button class="item" [class.sold]="!item.isAvailable || item.stockQuantity < 1 || inCartAtStock(item.id)"
                (click)="addToCart(item)" [disabled]="!item.isAvailable || item.stockQuantity < 1 || inCartAtStock(item.id)">
                @if (item.imageUrl) { <img [src]="item.imageUrl" alt="" class="item-img" /> }
                @else { <div class="item-img placeholder">☕</div> }
                <div class="item-body">
                  <span class="item-name">{{ item.name }}</span>
                  <span class="item-price">R{{ item.price | number:'1.2-2' }}</span>
                </div>
                @if (!item.isAvailable || item.stockQuantity < 1) { <span class="item-badge">Sold out</span> }
              </button>
            } @empty {
              <div class="items-empty">
                <span class="empty-ic">☕</span>
                <p>No products here</p>
                <p class="sub">Add products in the admin panel.</p>
              </div>
            }
          </div>
          }
        </div>

        <!-- Current order — always visible, never hidden. On narrow screens the
             whole panel becomes a bottom drawer whose header stays peeking. -->
        <div class="cart" [class.cart-open]="cartOpen()">
          <div class="cart-head" (click)="toggleCart()">
            <h2 class="cart-title">Current order</h2>
            <span class="cart-head-total">R{{ total() | number:'1.2-2' }}</span>
            @if (cart().length) { <span class="cart-count">{{ cart().length }} item{{ cart().length !== 1 ? 's' : '' }}</span> }
            <span class="cart-chev">{{ cartOpen() ? '▾' : '▴' }}</span>
          </div>
          <div class="cart-items">
            @if (cart().length === 0) {
              <div class="cart-empty">
                <span class="empty-ic">🛒</span>
                <p>No items yet</p>
                <p class="sub">Tap a drink to begin.</p>
              </div>
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
                  <button class="qty-btn" [disabled]="ci.quantity >= stockOf(ci.id)" (click)="updateQty(ci.id, 1)">+</button>
                </div>
                <span class="cart-total">R{{ (ci.price * ci.quantity) | number:'1.2-2' }}</span>
              </div>
            }
          </div>
          <div class="cart-foot">
            <div class="cart-subtotal"><span>Subtotal</span><span>R{{ total() | number:'1.2-2' }}</span></div>
            <div class="cart-summary"><span>Total</span><strong>R{{ total() | number:'1.2-2' }}</strong></div>
            <button class="btn-checkout" (click)="checkout()" [disabled]="cart().length === 0 || busy()">
              {{ busy() ? 'Placing order…' : 'Checkout · R' + (total() | number:'1.2-2') }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Overlays at the ROOT so they render on the clock-in screen too —
         the shift summary must pop up the moment a shift ENDS. -->

    <!-- Receipt after checkout -->
    @if (lastOrder(); as o) {
      <div class="complete">
        <div class="complete-card receipt-wrap">
          <app-receipt [order]="o" [shop]="shopInfo()" [cashierName]="auth.getUser()?.displayName ?? ''" />
          <app-btn variant="primary" size="sm" (onClick)="closeReceipt()">New order</app-btn>
        </div>
      </div>
    }

    <!-- Shift summary after clock-out -->
    @if (shiftSummary(); as s) {
      <div class="complete">
        <div class="complete-card summary-card">
          <span class="complete-check">⏱</span>
          <strong>Shift over — well done!</strong>
          <div class="sum-grid">
            <div class="sum-cell"><span class="sum-val">{{ s.orderCount }}</span><span class="sum-lbl">Orders</span></div>
            <div class="sum-cell"><span class="sum-val">{{ s.itemCount }}</span><span class="sum-lbl">Items sold</span></div>
            <div class="sum-cell"><span class="sum-val">R{{ s.revenue | number:'1.2-2' }}</span><span class="sum-lbl">Revenue</span></div>
            <div class="sum-cell"><span class="sum-val">R{{ s.averageOrder | number:'1.2-2' }}</span><span class="sum-lbl">Avg order</span></div>
          </div>
          <app-btn variant="primary" (onClick)="shiftSummary.set(null)">Done</app-btn>
        </div>
      </div>
    }

    <!-- Payment sheet -->
    @if (paymentOpen()) {
      <div class="complete">
        <div class="complete-card pay-card">
          <div class="pay-head">
            <h3>Payment</h3>
            <app-btn size="sm" (onClick)="paymentOpen.set(false)">✕</app-btn>
          </div>
          <div class="pay-total">
            <span class="pay-total-lbl">Total due</span>
            <span class="pay-total-val">R{{ total() | number:'1.2-2' }}</span>
          </div>

          <!-- Method toggle -->
          <div class="pay-methods">
            <button class="pay-method" [class.on]="payMethod() === 'cash'" (click)="payMethod.set('cash')">💵 Cash</button>
            <button class="pay-method" [class.on]="payMethod() === 'card'" (click)="payMethod.set('card')">💳 Card</button>
          </div>

          @if (payMethod() === 'cash') {
            <!-- Tendered amount + change -->
            <div class="pay-received">
              <span class="pay-received-lbl">Received</span>
              <span class="pay-received-val">R{{ receivedText() || '0' }}</span>
            </div>
            <div class="pay-quick">
              <button class="qk" (click)="setQuick('exact')">Exact</button>
              <button class="qk" (click)="setQuick('50')">R50</button>
              <button class="qk" (click)="setQuick('100')">R100</button>
              <button class="qk" (click)="setQuick('200')">R200</button>
            </div>
            <div class="pay-keys">
              @for (k of ['1','2','3','4','5','6','7','8','9','.','0','⌫']; track k) {
                <button class="pk" (click)="pressKey(k)">{{ k }}</button>
              }
            </div>
            @if (change() > 0) {
              <div class="pay-change"><span>Change</span><strong>R{{ change() | number:'1.2-2' }}</strong></div>
            }
          } @else {
            <p class="pay-card-note">Take the card payment on the terminal, then confirm.</p>
          }

          <button class="btn-checkout" [disabled]="busy() || !canConfirm()" (click)="confirmPayment()">
            {{ busy() ? 'Placing order…' : payMethod() === 'cash' ? 'Charge R' + (total() | number:'1.2-2') : 'Confirm card payment' }}
          </button>
        </div>
      </div>
    }
  `,
  styles: [`
    /* ── Clock-in gate ── */
    .clockin { display: flex; align-items: center; justify-content: center; height: calc(100vh - 120px); }
    .clockin-card { display: flex; flex-direction: column; align-items: center; gap: 0.25rem; padding: 3rem 3.5rem; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-md); text-align: center; }
    .clockin-logo { width: 76px; height: 76px; border-radius: 20px; object-fit: cover; border: 1px solid var(--border); background: var(--surface-2); }
    .clockin-logo.placeholder { display: flex; align-items: center; justify-content: center; font-size: 2.25rem; }
    .clockin-card h2 { margin: 0.75rem 0 0; font-size: 1.375rem; color: var(--text); }
    .clockin-sub { margin: 0 0 1rem; font-size: 0.8125rem; color: var(--muted); }
    .btn-start { margin-top: 0.5rem; padding: 0.9rem 3rem; border: 0; border-radius: var(--radius-sm); background: var(--accent); color: #fff; font-family: inherit; font-size: 1.0625rem; font-weight: 700; cursor: pointer; transition: all 0.15s ease-out; }
    .btn-start:hover:not(:disabled) { background: var(--accent-hover); transform: translateY(-1px); }
    .btn-start:disabled { opacity: 0.5; }
    .btn-switch { margin-top: 0.5rem; padding: 0.55rem 2rem; border: 1px solid var(--border-hover); border-radius: var(--radius-sm); background: transparent; color: var(--text-2); font-family: inherit; font-size: 0.8125rem; font-weight: 600; cursor: pointer; transition: all 0.15s ease-out; }
    .btn-switch:hover { border-color: var(--accent); color: var(--text); background: var(--surface-2); }

    /* ── Top bar ── */
    .pos-bar { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: 0.5rem 0; margin-bottom: 0.75rem; }
    .pos-bar-left { display: flex; align-items: center; gap: 0.75rem; min-width: 0; }
    .pos-logo { height: 34px; width: 34px; border-radius: 10px; object-fit: cover; border: 1px solid var(--border); background: var(--surface-2); }
    .pos-user-wrap { display: flex; align-items: center; gap: 0.6rem; }
    .pos-user { font-weight: 700; font-size: 0.9375rem; color: var(--text); white-space: nowrap; }
    .shift-badge { font-size: 0.7rem; font-weight: 700; padding: 0.2rem 0.6rem; border-radius: var(--radius-pill); background: var(--green-bg); color: var(--green); }
    .pos-bar-right { display: flex; gap: 0.375rem; }

    .pos-search { flex: 1; max-width: 460px; margin: 0 auto; position: relative; }
    .pos-search input { width: 100%; padding: 0.55rem 0.9rem 0.55rem 2.35rem; border-radius: var(--radius-pill); background: var(--surface-2); border: 1px solid var(--border-hover); color: var(--text); font-size: 0.875rem; font-family: inherit; outline: none; transition: border-color 0.15s; }
    .pos-search input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(200,135,56,0.15); }
    .pos-search input::placeholder { color: var(--muted); }
    .search-ic { position: absolute; left: 0.85rem; top: 50%; transform: translateY(-50%); color: var(--muted); display: flex; pointer-events: none; }

    /* ── Main layout: categories · products · cart ── */
    .pos-layout { display: flex; gap: 1rem; height: calc(100vh - 175px); }

    .cats { width: 150px; flex-shrink: 0; display: flex; flex-direction: column; gap: 0.5rem; overflow-y: auto; padding-bottom: 0.5rem; }
    .cat-btn { text-align: left; padding: 0.9rem 1rem; border-radius: var(--radius-sm); border: 0; background: var(--surface); color: var(--text-2); font-size: 0.875rem; font-weight: 600; cursor: pointer; font-family: inherit; transition: all 0.15s ease-out; min-height: 48px; }
    .cat-btn:hover { background: var(--surface-2); color: var(--text); }
    .cat-btn.active { background: var(--accent); color: #fff; }

    .pos-menu { flex: 1; display: flex; flex-direction: column; min-width: 0; }
    .results-hint { margin: 0 0 0.5rem; font-size: 0.8rem; color: var(--muted); }
    .items { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 0.875rem; overflow-y: auto; align-content: start; padding-bottom: 1rem; }
    .item { position: relative; display: flex; flex-direction: column; border-radius: var(--radius); overflow: hidden; border: 1px solid var(--border); background: var(--surface); cursor: pointer; transition: all 0.15s ease-out; padding: 0; box-shadow: var(--shadow-sm); min-height: 232px; }
    .item:hover:not(:disabled) { border-color: var(--accent); box-shadow: var(--shadow-md); transform: translateY(-2px); }
    .item:active:not(:disabled) { transform: scale(0.98); }
    .item.sold { opacity: 0.45; }
    .item:disabled { cursor: default; }
    .item-img { width: 100%; height: 180px; object-fit: cover; display: block; background: var(--surface-2); }
    .item-img.placeholder { display: flex; align-items: center; justify-content: center; font-size: 3rem; }
    .item-body { padding: 0.75rem; display: flex; flex-direction: column; gap: 0.25rem; }
    .item-name { font-size: 0.9375rem; font-weight: 700; line-height: 1.3; color: var(--text); }
    .item-price { font-size: 1.0625rem; font-weight: 700; color: var(--accent-hover); }
    .item-badge { position: absolute; top: 8px; left: 8px; background: var(--red); color: #fff; font-size: 0.625rem; font-weight: 700; padding: 0.2rem 0.55rem; border-radius: var(--radius-pill); }
    .items-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.25rem; padding: 3rem 0; color: var(--muted); }
    .items-empty p { margin: 0; font-size: 0.9375rem; font-weight: 600; color: var(--text-2); }
    .items-empty .sub { font-size: 0.8125rem; font-weight: 500; color: var(--muted); }
    .item.skel { pointer-events: none; }
    .sk-line { display: block; height: 12px; border-radius: 6px; background: var(--surface-2); margin-bottom: 0.4rem; }
    .shimmer { position: relative; overflow: hidden; }
    .shimmer::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent); animation: shimmer 1.4s ease-in-out infinite; }
    @keyframes shimmer { from { transform: translateX(-100%); } to { transform: translateX(100%); } }

    /* ── Current order — the heavy panel ── */
    .cart { width: 360px; flex-shrink: 0; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-md); display: flex; flex-direction: column; overflow: hidden; }
    .cart-head { padding: 1rem 1.25rem; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; gap: 0.6rem; }
    .cart-title { margin: 0; font-size: 1rem; font-weight: 700; color: var(--text); }
    .cart-head-total { margin-left: auto; font-weight: 800; font-size: 0.9375rem; color: var(--accent-2); font-variant-numeric: tabular-nums; }
    .cart-count { font-size: 0.75rem; color: var(--muted); font-weight: 600; }
    .cart-chev { display: none; font-size: 0.8rem; color: var(--muted); }
    .cart-items { flex: 1; overflow-y: auto; padding: 0.25rem 1.25rem; }
    .cart-empty { text-align: center; padding: 2.5rem 0; color: var(--muted); }
    .cart-empty p { margin: 0.5rem 0 0; font-weight: 600; color: var(--text-2); }
    .cart-empty .sub { font-weight: 500; color: var(--muted); }
    .empty-ic { font-size: 2.25rem; line-height: 1; }
    .cart-row { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 0; border-bottom: 1px solid var(--border); }
    .cart-row:last-child { border: 0; }
    .cart-info { flex: 1; min-width: 0; }
    .cart-name { font-size: 0.875rem; font-weight: 700; color: var(--text); display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cart-unit { font-size: 0.6875rem; color: var(--muted); }
    .cart-qty { display: flex; align-items: center; gap: 0.375rem; flex-shrink: 0; }
        .qty-btn { width: 44px; height: 44px; border: 0; border-radius: var(--radius-sm); background: var(--surface-2); cursor: pointer; font-size: 1.125rem; font-weight: 700; display: flex; align-items: center; justify-content: center; color: var(--text-2); transition: all 0.15s ease-out; }
    .qty-btn:hover:not(:disabled) { background: var(--accent); color: #fff; }
    .qty-btn:disabled { opacity: 0.35; cursor: default; }
    .qty-val { font-weight: 700; min-width: 1.5rem; text-align: center; font-size: 0.875rem; color: var(--text); }
    .cart-total { font-weight: 700; min-width: 4.5rem; text-align: right; font-size: 0.875rem; font-variant-numeric: tabular-nums; color: var(--text); }
    .cart-foot { padding: 1rem 1.25rem; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 0.5rem; background: var(--surface-2); }
    .cart-subtotal, .cart-summary { display: flex; justify-content: space-between; align-items: baseline; }
    .cart-subtotal { font-size: 0.8125rem; color: var(--text-2); }
    .cart-summary { font-size: 1rem; }
    .cart-summary strong { font-size: 1.375rem; font-weight: 800; color: var(--text); }
    .btn-checkout { margin-top: 0.25rem; padding: 0.9rem 1rem; border: 0; border-radius: var(--radius-sm); background: var(--accent); color: #fff; font-family: inherit; font-size: 1rem; font-weight: 700; cursor: pointer; transition: all 0.15s ease-out; }
    .btn-checkout:hover:not(:disabled) { background: var(--accent-hover); transform: translateY(-1px); }
    .btn-checkout:disabled { opacity: 0.35; pointer-events: none; }

    /* ── Tablets / narrow screens: cart becomes a bottom drawer, categories
       become a horizontal chip row, touch targets stay big. ── */
    @media (max-width: 1024px) {
      .pos-layout { flex-direction: column; height: auto; gap: 0.5rem; }
      .cats { flex-direction: row; width: 100%; overflow-x: auto; padding-bottom: 0.25rem; }
      .cat-btn { white-space: nowrap; }
      .pos-menu { flex: none; height: calc(100vh - 300px); }
      .cart {
        position: fixed;
        left: 0; right: 0; bottom: 0;
        width: 100%;
        max-height: 72vh;
        border-radius: var(--radius-lg) var(--radius-lg) 0 0;
        transform: translateY(calc(100% - 58px)); /* header peeks when closed */
        transition: transform 0.25s ease;
        z-index: 400;
        box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.35);
      }
      .cart.cart-open { transform: translateY(0); }
      .cart-head { cursor: pointer; padding: 0.85rem 1.25rem; }
      .cart-chev { display: inline-block; }
    }
    .complete { position: fixed; inset: 0; background: rgba(24,24,24,0.72); display: flex; align-items: center; justify-content: center; z-index: 500; }
    .complete-card { display: flex; flex-direction: column; align-items: center; gap: 0.75rem; background: var(--surface); border: 1px solid var(--accent); border-radius: var(--radius-lg); padding: 2.5rem 3rem; box-shadow: var(--shadow-lg); }
    .complete-check { width: 72px; height: 72px; border-radius: 50%; background: var(--green); color: #fff; font-size: 2.25rem; display: flex; align-items: center; justify-content: center; animation: pop 0.3s ease-out; }
    .complete-card strong { font-size: 1.25rem; color: var(--text); }

    /* Receipt + summary overlays */
    .receipt-wrap { padding: 2rem; gap: 1.25rem; }
    .summary-card { max-width: 420px; width: 90vw; }
    .sum-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; width: 100%; margin: 0.5rem 0; }
    .sum-cell { display: flex; flex-direction: column; align-items: center; gap: 0.15rem; background: var(--surface-2); border-radius: var(--radius-sm); padding: 1rem; }
    .sum-val { font-size: 1.375rem; font-weight: 800; color: var(--accent-2); }
    .sum-lbl { font-size: 0.6875rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; }

    /* Payment sheet */
    .pay-card { width: 380px; max-width: 94vw; padding: 1.5rem; }
    .pay-head { display: flex; justify-content: space-between; align-items: center; width: 100%; }
    .pay-head h3 { margin: 0; font-size: 1rem; }
    .pay-total { display: flex; flex-direction: column; align-items: center; gap: 0.1rem; padding: 0.75rem 0 0.25rem; width: 100%; }
    .pay-total-lbl { font-size: 0.6875rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; }
    .pay-total-val { font-size: 2rem; font-weight: 800; color: var(--text); }
    .pay-methods { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; width: 100%; margin: 0.75rem 0 0.5rem; }
    .pay-method { padding: 0.8rem; border: 1px solid var(--border-hover); border-radius: var(--radius-sm); background: var(--surface-2); color: var(--text-2); font-family: inherit; font-size: 0.9375rem; font-weight: 700; cursor: pointer; transition: all 0.15s; }
    .pay-method.on { background: var(--accent); border-color: var(--accent); color: #fff; }
    .pay-received { display: flex; justify-content: space-between; align-items: baseline; width: 100%; padding: 0.4rem 0; }
    .pay-received-lbl { font-size: 0.75rem; color: var(--muted); font-weight: 600; }
    .pay-received-val { font-size: 1.5rem; font-weight: 800; color: var(--accent-2); font-variant-numeric: tabular-nums; }
    .pay-quick { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.4rem; width: 100%; margin-bottom: 0.5rem; }
    .qk { padding: 0.55rem; border: 1px solid var(--border-hover); border-radius: var(--radius-sm); background: var(--surface-2); color: var(--text-2); font-family: inherit; font-size: 0.8125rem; font-weight: 700; cursor: pointer; }
    .qk:hover { border-color: var(--accent); color: var(--text); }
    .pay-keys { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.45rem; width: 100%; }
    .pk { padding: 0.85rem 0; border: 1px solid var(--border-hover); border-radius: var(--radius-sm); background: var(--surface-2); color: var(--text); font-family: inherit; font-size: 1.125rem; font-weight: 700; cursor: pointer; transition: all 0.12s; }
    .pk:hover { background: var(--surface-3); }
    .pk:active { transform: scale(0.95); }
    .pay-change { display: flex; justify-content: space-between; align-items: baseline; width: 100%; padding: 0.5rem 0 0.25rem; border-top: 1px dashed var(--border); margin-top: 0.5rem; }
    .pay-change span { font-size: 0.8125rem; color: var(--muted); font-weight: 600; }
    .pay-change strong { font-size: 1.375rem; font-weight: 800; color: var(--green); }
    .pay-card-note { color: var(--text-2); font-size: 0.875rem; margin: 0.5rem 0; }

    @keyframes pop { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
  `]
})
export class PosComponent implements OnInit {
  private service = inject(MenuItemService);
  private dialog = inject(DialogService);
  private router = inject(Router);
  auth = inject(AuthService);

  // Items & cart
  items: MenuItem[] = [];
  readonly cart = signal<CartItem[]>([]);
  readonly busy = signal(false);
  readonly loading = signal(true);
  activeCat = 'Hot Drinks';
  // Bottom drawer on narrow screens (open by default on wide screens).
  readonly cartOpen = signal(typeof window !== 'undefined' && window.innerWidth > 1024);

  toggleCart() { this.cartOpen.update(v => !v); }

  // Search (top bar, always visible) — debounced 200ms so typing doesn't thrash.
  search = '';
  readonly query = signal('');
  private searchTimer: any;

  // Crash recovery: the cart survives an unexpected reload/termination.
  private readonly cartKey = 'pos_cart';
  private readonly persistCart = effect(() =>
    sessionStorage.setItem(this.cartKey, JSON.stringify(this.cart())));

  // Shop branding (logo)
  readonly shopInfo = signal<any>(null);

  // Shift
  readonly shiftActive = signal(false);
  readonly startingShift = signal(false);

  // Order complete overlay
  readonly complete = signal(false);

  // Till: payment sheet + receipt
  readonly paymentOpen = signal(false);
  readonly payMethod = signal<'cash' | 'card'>('cash');
  readonly receivedText = signal('');
  readonly lastOrder = signal<any | null>(null);

  // Shift summary (shown at clock-out)
  readonly shiftSummary = signal<any | null>(null);

  get categories(): string[] { return [...new Set(this.items.map(i => i.category))].sort(); }
  searching(): boolean { return this.query().trim().length > 0; }

  // Debounce the keystrokes, then publish the query.
  onSearch() {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.query.set(this.search), 200);
  }

  // Search takes over from categories while text is typed; otherwise filter by the active category.
  readonly filtered = () => {
    const q = this.query().trim().toLowerCase();
    return q
      ? this.items.filter(i => i.name.toLowerCase().includes(q))
      : this.items.filter(i => i.category === this.activeCat);
  };
  readonly total = () => this.cart().reduce((s, i) => s + i.price * i.quantity, 0);
  skeletonCards(): number[] { return [0, 1, 2, 3, 4, 5, 6, 7]; }

  // Stock guardrails — the cart can never exceed what we have.
  stockOf(id: number): number { return this.items.find(i => i.id === id)?.stockQuantity ?? 0; }
  inCartAtStock(id: number): boolean {
    const inCart = this.cart().find(i => i.id === id);
    return inCart ? inCart.quantity >= this.stockOf(id) : false;
  }

  ngOnInit() { this.restoreCart(); this.load(); this.checkShift(); this.loadShop(); }

  private load() {
    this.loading.set(true);
    this.service.getItems().subscribe(items => {
      this.items = items;
      this.loading.set(false);
      // The default category is a guess ('Hot Drinks'); snap to the first real
      // one so a shop without it never stares at an empty grid.
      const cats = this.categories;
      if (cats.length && !cats.includes(this.activeCat)) this.activeCat = cats[0];
    });
  }

  // Restore an in-flight cart after a crash/reload so no sale is lost mid-keystroke.
  private restoreCart() {
    try {
      const raw = sessionStorage.getItem(this.cartKey);
      if (raw) this.cart.set(JSON.parse(raw));
    } catch { /* corrupted or unavailable — start clean */ }
  }
  private checkShift() { this.service.getActiveShift().subscribe({ next: s => this.shiftActive.set(s.active), error: () => this.dialog.toast('Could not check shift status', 'error') }); }
  private loadShop() { this.service.getShopInfo().subscribe(s => this.shopInfo.set(s)); }

  startShift() {
    this.startingShift.set(true);
    this.service.startShift().subscribe({
      next: () => { this.startingShift.set(false); this.shiftActive.set(true); },
      error: (e) => { this.startingShift.set(false); this.dialog.toast(e.error?.error || 'Could not start shift', 'error'); }
    });
  }

  // Handover: sign the current user out and drop the next cashier straight
  // into PIN sign-in, carrying the shop code so they never retype it.
  switchUser() {
    const code = this.auth.getShop()?.code;
    const qp: any = { pin: 1 };
    if (code) qp.shop = code;
    this.auth.logout()
      .pipe(finalize(() => this.router.navigate(['/login'], { queryParams: qp })))
      .subscribe();
  }

  endShift() {
    this.service.endShift().subscribe({
      next: () => {
        this.shiftActive.set(false);
        // Clock-out summary: what did this shift sell?
        this.service.getShiftSummary().subscribe({
          next: s => this.shiftSummary.set(s),
          error: () => this.shiftSummary.set(null)
        });
      },
      error: (e) => this.dialog.toast(e.error?.error || 'Could not end shift', 'error')
    });
  }

  addToCart(item: MenuItem) {
    this.cart.update(c => {
      const exist = c.find(i => i.id === item.id);
      const nextQty = (exist?.quantity ?? 0) + 1;
      if (nextQty > item.stockQuantity) return c; // can't add more than in stock
      return exist ? c.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i)
        : [...c, { id: item.id, name: item.name, price: item.price, quantity: 1 }];
    });
  }

  updateQty(id: number, delta: number) {
    this.cart.update(c => c.map(i => {
      if (i.id !== id) return i;
      const max = this.stockOf(id);
      return { ...i, quantity: Math.min(Math.max(0, i.quantity + delta), max) };
    }).filter(i => i.quantity > 0));
  }

  // ── Till / payment ──────────────────────────────────────

  readonly received = () => parseFloat(this.receivedText()) || 0;
  readonly change = () => Math.max(0, this.received() - this.total());
  readonly canConfirm = () => this.payMethod() === 'card' || this.received() >= this.total();

  pressKey(k: string) {
    if (k === '⌫') this.receivedText.update(t => t.slice(0, -1));
    else if (k === '.') {
      if (!this.receivedText().includes('.')) this.receivedText.update(t => (t ? t + '.' : '0.'));
    } else {
      // max 2 decimals
      const t = this.receivedText();
      if (t.includes('.')) {
        const dec = t.split('.')[1] ?? '';
        if (dec.length >= 2) return;
      }
      this.receivedText.update(t => t + k);
    }
  }

  setQuick(which: string) {
    if (which === 'exact') this.receivedText.set(this.total().toFixed(2));
    else this.receivedText.set(which);
  }

  // Checkout button: open the payment sheet instead of charging blindly.
  checkout() {
    if (this.cart().length === 0) return;
    this.payMethod.set('cash');
    this.receivedText.set('');
    this.paymentOpen.set(true);
  }

  confirmPayment() {
    if (!this.canConfirm() || this.busy()) return;
    this.busy.set(true);
    this.service.placeOrder(this.cart(), {
      method: this.payMethod(),
      amountReceived: this.payMethod() === 'cash' ? this.received() : null
    }).subscribe({
      next: (order) => {
        this.busy.set(false);
        this.paymentOpen.set(false);
        this.cart.set([]);
        this.load();
        this.lastOrder.set(order);
      },
      error: (e) => {
        this.busy.set(false);
        this.dialog.toast(e.error?.error || 'Checkout failed', 'error');
        this.load();
      }
    });
  }

  closeReceipt() { this.lastOrder.set(null); this.showComplete(); }

  // Brief success moment, then straight back to a clean POS.
  private showComplete() {
    this.complete.set(true);
    setTimeout(() => this.complete.set(false), 1600);
  }
}
