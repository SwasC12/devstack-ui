import { Component, effect, inject, signal, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { MenuItemService } from '../../menu-item.service';
import { MenuItem, ModifierGroup } from '../../menu-item.model';
import { AuthService } from '../../auth.service';
import { BtnComponent } from '../../btn.component';
import { DialogService } from '../../dialog.service';
import { ReceiptViewComponent } from '../../receipt-view.component';
import { ClockComponent } from '../../clock.component';
import { AppLogoComponent } from '../../app-logo.component';
import { PrintService } from '../../print.service';
import { SoundService } from '../../sound.service';

interface CartItem { id: number; name: string; price: number; quantity: number; sizeId?: number; sizeName?: string; modifiers?: { groupName: string; name: string; priceDelta: number }[]; note?: string; }

@Component({
  selector: 'app-pos',
  standalone: true,
  imports: [CommonModule, FormsModule, BtnComponent, ReceiptViewComponent, AppLogoComponent, ClockComponent],
  template: `
    <!-- Not on shift: one big, obvious clock-in screen. No POS until you're in. -->
    @if (!shiftActive()) {
      <div class="clockin">
        <div class="clockin-card">
          @if (shopInfo()?.logoUrl) { <img [src]="shopInfo()?.logoUrl" alt="" class="clockin-logo" /> }
          @else { <div class="clockin-logo placeholder"><app-logo [size]="40" /></div> }
          <h2>{{ auth.getUser()?.displayName }}</h2>
          <p class="clockin-sub">{{ shopInfo()?.name || 'CoffeeShop Pro' }}</p>
          <div class="clockin-float">
            <label>Starting float (cash in the till)</label>
            <input type="number" step="0.01" min="0" [(ngModel)]="floatInput" placeholder="0.00" />
          </div>
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
          <app-clock />
          <button class="pos-reprint" (click)="reprintLast()" [disabled]="!lastReceipt()" title="Reprint last receipt">🖨</button>
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
                @else { <div class="item-img placeholder"><app-logo [size]="54" /></div> }
                <div class="item-body">
                  <span class="item-name">{{ item.name }}</span>
                  @if (item.sizes?.length) {
                    <span class="item-price">from R{{ minSizePrice(item) | number:'1.2-2' }}</span>
                    <span class="item-sizes">{{ sizeNames(item) }}</span>
                  } @else {
                    <span class="item-price">R{{ item.price | number:'1.2-2' }}</span>
                  }
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
            @for (ci of cart(); track lineKey(ci)) {
              <div class="cart-row">
                <div class="cart-info">
                  <span class="cart-name">{{ ci.name }}</span>
                  @if (ci.sizeName) { <span class="cart-size">{{ ci.sizeName }}</span> }
                  @if (ci.modifiers?.length) { <span class="cart-mod">{{ modSummary(ci) }}</span> }
                  @if (ci.note) { <span class="cart-note">📝 {{ ci.note }}</span> }
                  <span class="cart-unit">R{{ ci.price | number:'1.2-2' }} ea</span>
                </div>
                <div class="cart-qty">
                  <button class="qty-btn" (click)="updateQty(ci, -1)">−</button>
                  <span class="qty-val">{{ ci.quantity }}</span>
                  <button class="qty-btn" [disabled]="inCartAtStock(ci.id)" (click)="updateQty(ci, 1)">+</button>
                </div>
                <span class="cart-total">R{{ (ci.price * ci.quantity) | number:'1.2-2' }}</span>
              </div>
            }
          </div>
          <div class="cart-foot">
            <div class="cart-subtotal"><span>Subtotal</span><span>R{{ total() | number:'1.2-2' }}</span></div>
            @if (selectedDiscount(); as d) {
              <div class="cart-discount"><span>{{ d.name }}</span><span>−R{{ discountAmount() | number:'1.2-2' }}</span></div>
              <button class="link-clear" (click)="selectedDiscount.set(null)">Remove discount</button>
            } @else if (liveDiscounts().length) {
              <button class="disc-btn" (click)="discountOpen.set(true)">🏷 Add discount</button>
            }
            <div class="cart-summary"><span>Total</span><strong>R{{ netTotal() | number:'1.2-2' }}</strong></div>
            <button class="btn-checkout" (click)="checkout()" [disabled]="cart().length === 0 || busy()">
              {{ busy() ? 'Placing order…' : 'Checkout · R' + (netTotal() | number:'1.2-2') }}
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
        <div class="complete-card receipt-wrap" #receiptBox>
          <div class="receipt-scroll">
            <app-receipt [order]="o" [shop]="shopInfo()" [cashierName]="auth.getUser()?.displayName ?? ''" />
          </div>
          <div class="receipt-acts">
            <app-btn size="sm" (onClick)="printReceipt()">Print</app-btn>
            <app-btn variant="primary" size="sm" (onClick)="closeReceipt()">New order</app-btn>
          </div>
        </div>
      </div>
    }

    <!-- Shift summary after clock-out -->
    @if (shiftSummary(); as s) {
      <div class="complete">
        <div class="complete-card summary-card">
          <div class="sum-scroll">
            <span class="complete-check">✓</span>
            <strong>Shift over — well done!</strong>
            <div class="sum-grid">
              <div class="sum-cell"><span class="sum-val">{{ s.orderCount }}</span><span class="sum-lbl">Orders</span></div>
              <div class="sum-cell"><span class="sum-val">{{ s.itemCount }}</span><span class="sum-lbl">Items sold</span></div>
              <div class="sum-cell"><span class="sum-val">R{{ s.revenue | number:'1.2-2' }}</span><span class="sum-lbl">Revenue</span></div>
              <div class="sum-cell"><span class="sum-val">R{{ s.cashRevenue | number:'1.2-2' }}</span><span class="sum-lbl">Cash</span></div>
              <div class="sum-cell"><span class="sum-val">R{{ s.cardRevenue | number:'1.2-2' }}</span><span class="sum-lbl">Card</span></div>
              <div class="sum-cell"><span class="sum-val">R{{ s.averageOrder | number:'1.2-2' }}</span><span class="sum-lbl">Avg order</span></div>
            </div>
            @if (s.voidedCount > 0) { <div class="sum-void">Voided orders: {{ s.voidedCount }}</div> }
            <div class="cashup">
              <label>Cash counted in till</label>
              <input type="number" step="0.01" [ngModel]="cashCounted" (ngModelChange)="cashCounted = $event ? +$event : null" placeholder="0.00" />
              @if (cashCounted !== null) {
                @if (expectedTill() !== null) {
                  <div class="cashup-line">Expected: R{{ expectedTill() | number:'1.2-2' }} <span class="muted-note">(R{{ s.cashRevenue | number:'1.2-2' }} cash + R{{ (s.startingFloat ?? 0) | number:'1.2-2' }} float)</span></div>
                }
                <div class="cashup-diff" [class.short]="cashCounted < expectedTill()!" [class.over]="cashCounted > expectedTill()!">
                  {{ cashCounted < expectedTill()! ? 'Short' : cashCounted > expectedTill()! ? 'Over' : 'Balanced' }}: R{{ (cashCounted - expectedTill()!) | number:'1.2-2' }}
                </div>
              }
            </div>
          </div>
          <div class="sum-acts">
            <app-btn variant="primary" (onClick)="shiftSummary.set(null)">Done</app-btn>
          </div>
        </div>
      </div>
    }

    <!-- Product configurator (sizes / modifiers / note) -->
    @if (configurator(); as cfg) {
      <div class="complete" (click)="configurator.set(null)">
        <div class="complete-card size-card" (click)="$event.stopPropagation()">
          <div class="cfg-scroll">
            <strong>{{ cfg.item.name }}</strong>
          <span class="size-sub">Choose options</span>
          @if (cfg.item.sizes?.length) {
            <div class="cfg-group">
              <span class="cfg-group-name">Size</span>
              @for (s of cfg.item.sizes; track s.id) {
                <button class="cfg-opt" [class.on]="cfg.sizeId === s.id" (click)="cfgPickSize(cfg, s.id)">
                  <span>{{ s.name }}</span>
                  <span class="cfg-price">R{{ s.price | number:'1.2-2' }}</span>
                </button>
              }
            </div>
          }
          @for (g of cfg.item.modifierGroups ?? []; track g.id) {
            <div class="cfg-group">
              <span class="cfg-group-name">{{ g.name }}</span>
              @for (m of g.modifiers; track m.id) {
                <button class="cfg-opt" [class.on]="cfg.mods[m.id]" (click)="cfgToggleMod(cfg, g, m.id)">
                  <span>{{ m.name }}</span>
                  <span class="cfg-price">{{ m.priceDelta > 0 ? '+' + (m.priceDelta | number:'1.2-2') : '' }}</span>
                </button>
              }
            </div>
          }
          <input class="cfg-note" [(ngModel)]="cfg.note" placeholder="Note for the barista (optional)" />
          <div class="cfg-total">Total <strong>R{{ cfgTotal(cfg) | number:'1.2-2' }}</strong></div>
          </div>
          <div class="cfg-acts">
            <app-btn size="sm" (onClick)="configurator.set(null)">Cancel</app-btn>
            <app-btn variant="primary" size="sm" (onClick)="addConfig()">Add to order</app-btn>
          </div>
        </div>
      </div>
    }

    <!-- Discount picker -->
    @if (discountOpen()) {
      <div class="complete">
        <div class="complete-card pick-card">
          <div class="pay-head"><h3>Discounts &amp; specials</h3><app-btn size="sm" (onClick)="discountOpen.set(false)">✕</app-btn></div>
          @for (d of liveDiscounts(); track d.id) {
            <button class="pick-row" (click)="applyDiscount(d)">
              <span class="pick-name">{{ d.name }}</span>
              <span class="pick-val">{{ d.type === 'percent' ? d.value + '% off' : 'R' + (d.value | number:'1.2-2') + ' off' }}</span>
            </button>
          } @empty {
            <p class="hint" style="margin:0.5rem 0;">No discounts live right now.</p>
          }
        </div>
      </div>
    }

    <!-- Payment sheet -->
    @if (paymentOpen()) {
      <div class="complete">
        <div class="complete-card pay-card">
          <div class="pay-scroll">
            <div class="pay-head">
              <h3>Payment</h3>
              <app-btn size="sm" (onClick)="paymentOpen.set(false)">✕</app-btn>
            </div>
            <div class="pay-total">
              <span class="pay-total-lbl">Total due</span>
              <span class="pay-total-val">R{{ netTotal() | number:'1.2-2' }}</span>
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
          </div>

          <button class="btn-checkout" [disabled]="busy() || !canConfirm()" (click)="confirmPayment()">
            {{ busy() ? 'Placing order…' : payMethod() === 'cash' ? 'Charge R' + (netTotal() | number:'1.2-2') : 'Confirm card payment' }}
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
    .clockin-logo.placeholder { display: flex; align-items: center; justify-content: center; color: var(--accent-2); background: linear-gradient(135deg, var(--surface-2), var(--surface-3)); }
    .clockin-card h2 { margin: 0.75rem 0 0; font-size: 1.375rem; color: var(--text); }
    .clockin-sub { margin: 0 0 1rem; font-size: 0.8125rem; color: var(--muted); }
    .clockin-float { display: flex; flex-direction: column; gap: 0.3rem; width: 240px; margin-bottom: 0.75rem; }
    .clockin-float label { font-size: 0.72rem; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
    .clockin-float input { padding: 0.65rem 0.8rem; border: 1px solid var(--border-hover); border-radius: var(--radius-sm); background: var(--surface-2); color: var(--text); font-family: inherit; font-size: 1rem; font-weight: 700; text-align: center; outline: none; }
    .clockin-float input:focus { border-color: var(--accent); }
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
    .pos-bar-right { display: flex; gap: 0.375rem; align-items: center; }
    .pos-reprint { width: 38px; height: 38px; border: 0; border-radius: var(--radius-sm); background: var(--surface-2); color: var(--text-2); font-size: 1rem; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s ease-out; }
    .pos-reprint:hover:not(:disabled) { background: var(--accent); color: #fff; }
    .pos-reprint:disabled { opacity: 0.35; cursor: default; }

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
    .items { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 0.875rem; overflow-y: auto; align-content: start; padding: 0.25rem 0 1rem; }
    .item { position: relative; display: flex; flex-direction: column; border-radius: var(--radius); overflow: hidden; border: 1px solid var(--border); background: var(--surface); cursor: pointer; transition: all 0.15s ease-out; padding: 0; box-shadow: var(--shadow-sm); min-height: 232px; }
    .item:hover:not(:disabled) { border-color: var(--accent); box-shadow: var(--shadow-md); transform: translateY(-2px); }
    .item:active:not(:disabled) { transform: scale(0.98); }
    .item.sold { opacity: 0.45; }
    .item:disabled { cursor: default; }
    .item-img { width: 100%; height: 180px; object-fit: cover; display: block; background: var(--surface-2); transition: transform 0.3s ease; }
    .item-img.placeholder { display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, var(--surface-2), var(--surface-3)); color: var(--muted); }
    .item:hover .item-img { transform: scale(1.045); }
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
    .cart-discount { display: flex; justify-content: space-between; align-items: baseline; color: var(--green); font-size: 0.8125rem; font-weight: 700; }
    .link-clear { border: 0; background: transparent; color: var(--muted); font-family: inherit; font-size: 0.6875rem; cursor: pointer; text-decoration: underline; align-self: flex-start; }
    .disc-btn { padding: 0.5rem; border: 1px dashed var(--border-hover); border-radius: var(--radius-sm); background: transparent; color: var(--accent-2); font-family: inherit; font-size: 0.8125rem; font-weight: 700; cursor: pointer; }
    .disc-btn:hover { border-color: var(--accent); background: var(--accent-light); }
    .pick-card { width: min(360px, 100%); padding: 1.5rem; gap: 0.5rem; align-items: stretch; }
    .pick-row { display: flex; justify-content: space-between; align-items: center; padding: 0.8rem 1rem; border: 1px solid var(--border-hover); border-radius: var(--radius-sm); background: var(--surface-2); color: var(--text); font-family: inherit; cursor: pointer; }
    .pick-row:hover { border-color: var(--accent); }
    .size-card { width: min(420px, 100%); align-items: stretch; max-height: calc(100dvh - 3rem); max-height: calc(100vh - 3rem); overflow: hidden; padding: 2.5rem 3rem 0; gap: 0; }
    .cfg-scroll { overflow-y: auto; display: flex; flex-direction: column; gap: 0.75rem; min-height: 0; padding-bottom: 0.5rem; }
    .cfg-acts { display: flex; justify-content: flex-end; gap: 0.5rem; padding: 1rem 0 1.25rem; margin-top: 0.5rem; border-top: 1px solid var(--border); flex-shrink: 0; }
    .size-sub { margin: -0.25rem 0 0.5rem; font-size: 0.8125rem; color: var(--muted); }
    .cfg-group { display: flex; flex-direction: column; gap: 0.4rem; margin-bottom: 0.4rem; }
    .cfg-group-name { font-size: 0.68rem; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 0.4rem; }
    .cfg-opt { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; border: 1px solid var(--border-hover); border-radius: var(--radius-sm); background: var(--surface-2); color: var(--text); font-family: inherit; font-size: 0.9375rem; font-weight: 600; cursor: pointer; transition: all 0.12s; }
    .cfg-opt.on { border-color: var(--accent); background: var(--accent-light); color: var(--accent-2); }
    .cfg-price { color: var(--accent-2); font-variant-numeric: tabular-nums; }
    .cfg-note { padding: 0.65rem 0.8rem; border: 1px solid var(--border-hover); border-radius: var(--radius-sm); background: var(--surface-2); color: var(--text); font-family: inherit; font-size: 0.875rem; outline: none; }
    .cfg-note:focus { border-color: var(--accent); }
    .cfg-total { display: flex; justify-content: space-between; align-items: center; font-size: 0.9375rem; color: var(--text-2); padding: 0.4rem 0; }
    .cfg-total strong { font-size: 1.25rem; color: var(--text); }
    .cfg-acts { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.25rem; }
    .pay-cust { display: flex; flex-direction: column; gap: 0.4rem; width: 100%; margin: 0.5rem 0; }
    .pay-cust input { padding: 0.6rem 0.8rem; border: 1px solid var(--border-hover); border-radius: var(--radius-sm); background: var(--surface-2); color: var(--text); font-family: inherit; font-size: 0.875rem; outline: none; }
    .pay-cust input:focus { border-color: var(--accent); }
    .cart-mod { font-size: 0.72rem; color: var(--accent-2); font-weight: 600; }
    .cart-note { font-size: 0.72rem; color: var(--text-2); font-style: italic; }
    .pick-name { font-weight: 700; font-size: 0.875rem; }
    .pick-val { color: var(--accent-2); font-weight: 700; font-size: 0.8125rem; }
    .cart-subtotal { font-size: 0.8125rem; color: var(--text-2); }
    .cart-summary { font-size: 1rem; }
    .cart-summary strong { font-size: 1.375rem; font-weight: 800; color: var(--text); }
    .btn-checkout { margin: 0.75rem 0 1.25rem; flex-shrink: 0; padding: 0.9rem 1rem; border: 0; border-radius: var(--radius-sm); background: var(--accent); color: #fff; font-family: inherit; font-size: 1rem; font-weight: 700; cursor: pointer; transition: all 0.15s ease-out; }
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
    /* Overlays must never exceed the screen: the scrim scrolls, the card is
       capped to the viewport (margin:auto centers it, and when it's taller
       than the screen it scrolls from the top instead of clipping). */
    .complete { position: fixed; inset: 0; background: rgba(24,24,24,0.72); display: flex; overflow-y: auto; padding: 1.5rem; z-index: 500; }
    .complete-card { display: flex; flex-direction: column; align-items: center; gap: 0.75rem; margin: auto; max-width: 100%; max-height: calc(100dvh - 3rem); max-height: calc(100vh - 3rem); overflow-y: auto; background: var(--surface); border: 1px solid var(--accent); border-radius: var(--radius-lg); padding: 2.5rem 3rem; box-shadow: var(--shadow-lg); }
    .complete-check { width: 72px; height: 72px; border-radius: 50%; background: var(--green); color: #fff; font-size: 2.25rem; display: flex; align-items: center; justify-content: center; animation: pop 0.3s ease-out; }
    .complete-card strong { font-size: 1.25rem; color: var(--text); }

    /* Receipt + summary overlays: scrollable body, actions always pinned. */
    .receipt-wrap { padding: 0; gap: 0; width: min(440px, 100%); overflow: hidden; }
    .receipt-scroll { overflow-y: auto; padding: 2rem 2rem 0.75rem; display: flex; flex-direction: column; align-items: center; min-height: 0; }
    .receipt-acts { display: flex; justify-content: center; gap: 0.5rem; padding: 0.9rem 2rem 1.25rem; border-top: 1px solid var(--border); background: var(--surface); flex-shrink: 0; }
    .summary-card { width: min(420px, 100%); padding: 2.5rem 3rem 0; gap: 0; overflow: hidden; }
    .sum-scroll { overflow-y: auto; display: flex; flex-direction: column; align-items: center; gap: 0.75rem; min-height: 0; padding-bottom: 0.5rem; }
    .sum-acts { flex-shrink: 0; width: 100%; display: flex; justify-content: center; padding: 1rem 0 1.5rem; margin-top: 0.5rem; border-top: 1px solid var(--border); }
    .sum-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; width: 100%; margin: 0.5rem 0; }
    .sum-cell { display: flex; flex-direction: column; align-items: center; gap: 0.15rem; background: var(--surface-2); border-radius: var(--radius-sm); padding: 1rem; }
    .sum-val { font-size: 1.375rem; font-weight: 800; color: var(--accent-2); }
    .sum-lbl { font-size: 0.6875rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; }

    /* Payment sheet: keypad scrolls, Charge stays pinned. */
    .pay-card { width: min(380px, 100%); padding: 1.5rem 1.5rem 0; gap: 0; overflow: hidden; }
    .pay-scroll { overflow-y: auto; display: flex; flex-direction: column; align-items: stretch; gap: 0.75rem; min-height: 0; padding-bottom: 0.5rem; }
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

  // Discounts / specials
  readonly discounts = signal<any[]>([]);
  readonly selectedDiscount = signal<any | null>(null);
  readonly discountOpen = signal(false);

  // Product configurator (sizes + modifiers + note)
  readonly configurator = signal<{ item: MenuItem; sizeId: number | null; mods: Record<number, boolean>; note: string } | null>(null);
  // Checkout extras (optional)

  // Shift summary (shown at clock-out)
  readonly shiftSummary = signal<any | null>(null);
  cashCounted: number | null = null;
  // Cash expected in the till at clock-out: float + cash sales for the shift.
  readonly expectedTill = () => {
    const s = this.shiftSummary();
    if (!s) return null;
    return (s.cashRevenue ?? 0) + (s.startingFloat ?? 0);
  };
  floatInput = '';
  // Last completed order, kept for one-tap reprints after the receipt closes.
  readonly lastReceipt = signal<any | null>(null);
  @ViewChild('receiptBox') receiptBox!: ElementRef<HTMLElement>;
  private printer = inject(PrintService);
  private sound = inject(SoundService);

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

  // Stock guardrails — the cart can never exceed what we have. Stock is shared
  // across sizes, so the guard sums every line of the same item.
  stockOf(id: number): number { return this.items.find(i => i.id === id)?.stockQuantity ?? 0; }
  inCartAtStock(id: number): boolean {
    const inCart = this.cart().filter(i => i.id === id).reduce((s, i) => s + i.quantity, 0);
    return inCart >= this.stockOf(id);
  }

  // Sized items show their cheapest size on the card + the size names.
  minSizePrice(item: MenuItem): number { return Math.min(...(item.sizes ?? []).map(s => s.price)); }
  sizeNames(item: MenuItem): string { return (item.sizes ?? []).map(s => s.name).join(' · '); }

  ngOnInit() { this.restoreCart(); this.load(); this.checkShift(); this.loadShop(); this.loadDiscounts(); }

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
    const float = parseFloat(this.floatInput);
    this.service.startShift(Number.isFinite(float) && float > 0 ? float : 0).subscribe({
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
          next: s => { this.shiftSummary.set(s); this.cashCounted = null; },
          error: () => this.shiftSummary.set(null)
        });
      },
      error: (e) => this.dialog.toast(e.error?.error || 'Could not end shift', 'error')
    });
  }

  addToCart(item: MenuItem) {
    // Sized / modifiable items open the configurator; plain items add instantly.
    if (item.sizes?.length || item.modifierGroups?.length) {
      const mods: Record<number, boolean> = {};
      this.configurator.set({ item, sizeId: item.sizes?.length ? item.sizes[0].id : null, mods, note: '' });
      return;
    }
    this.addLine(item.id, item.name, item.price, undefined, undefined, undefined, undefined);
  }

  cfgPickSize(cfg: { item: MenuItem; sizeId: number | null }, sizeId: number) {
    this.configurator.update(c => (c ? { ...c, sizeId } : c));
  }

  cfgToggleMod(cfg: { item: MenuItem; mods: Record<number, boolean> }, g: ModifierGroup, modId: number) {
    this.configurator.update(c => {
      if (!c) return c;
      const mods = { ...c.mods, [modId]: !c.mods[modId] };
      if (!g.isMulti) {
        for (const m of g.modifiers) if (m.id !== modId) mods[m.id] = false;
      }
      return { ...c, mods };
    });
  }

  cfgTotal(cfg: { item: MenuItem; sizeId: number | null; mods: Record<number, boolean> }): number {
    const size = cfg.item.sizes?.find(s => s.id === cfg.sizeId);
    const mods = (cfg.item.modifierGroups ?? []).flatMap(g => g.modifiers).filter(m => cfg.mods[m.id]);
    return (size?.price ?? cfg.item.price) + mods.reduce((s, m) => s + m.priceDelta, 0);
  }

  addConfig() {
    const cfg = this.configurator();
    if (!cfg) return;
    const size = cfg.item.sizes?.find(s => s.id === cfg.sizeId);
    const mods = (cfg.item.modifierGroups ?? [])
      .flatMap(g => g.modifiers.filter(m => cfg.mods[m.id]).map(m => ({ groupName: g.name, name: m.name, priceDelta: m.priceDelta })));
    this.addLine(
      cfg.item.id, cfg.item.name, this.cfgTotal(cfg),
      size?.id, size?.name, mods,
      cfg.note.trim() || undefined
    );
    this.configurator.set(null);
  }

  private addLine(id: number, name: string, price: number, sizeId?: number, sizeName?: string, modifiers?: CartItem['modifiers'], note?: string) {
    this.cart.update(c => {
      const exist = c.find(i => this.sameLine(i, { id, sizeId, modifiers, note }));
      const inCart = c.filter(i => i.id === id).reduce((s, i) => s + i.quantity, 0);
      if (inCart + 1 > this.stockOf(id)) return c; // can't add more than in stock
      return exist
        ? c.map(i => this.sameLine(i, { id, sizeId, modifiers, note }) ? { ...i, quantity: i.quantity + 1 } : i)
        : [...c, { id, name, price, quantity: 1, sizeId, sizeName, modifiers, note }];
    });
  }

  updateQty(ci: CartItem, delta: number) {
    this.cart.update(c => c.map(i => {
      if (!this.sameLine(i, ci)) return i;
      const max = this.stockOf(i.id);
      return { ...i, quantity: Math.min(Math.max(0, i.quantity + delta), max) };
    }).filter(i => i.quantity > 0));
  }

  // Two cart lines are the same product when item + size + modifiers + note match.
  private sameLine(a: CartItem, b: Partial<CartItem>): boolean {
    return a.id === b.id && (a.sizeId ?? null) === (b.sizeId ?? null)
      && (a.note ?? '') === (b.note ?? '')
      && (a.modifiers?.map(m => m.name).join('|') ?? '') === (b.modifiers?.map(m => m.name).join('|') ?? '');
  }

  lineKey(ci: CartItem): string {
    return `${ci.id}:${ci.sizeId ?? 0}:${(ci.modifiers?.map(m => m.name).join('|') ?? '')}:${ci.note ?? ''}`;
  }

  modSummary(ci: CartItem): string {
    return (ci.modifiers ?? []).map(m => m.priceDelta > 0 ? `${m.name} +R${m.priceDelta}` : m.name).join(' · ');
  }

  // ── Discounts / specials ──────────────────────────────

  private loadDiscounts() { this.service.getDiscounts().subscribe(ds => this.discounts.set(ds)); }

  liveDiscounts(): any[] { return this.discounts().filter(d => d.isLive); }

  discountAmount(): number {
    const d = this.selectedDiscount();
    if (!d) return 0;
    return d.type === 'percent' ? Math.round(this.total() * d.value) / 100 : Math.min(d.value, this.total());
  }

  netTotal(): number { return Math.max(0, this.total() - this.discountAmount()); }

  applyDiscount(d: any) { this.selectedDiscount.set(d); this.discountOpen.set(false); }

  // ── Till / payment ──────────────────────────────────────

  readonly received = () => parseFloat(this.receivedText()) || 0;
  readonly change = () => Math.max(0, this.received() - this.netTotal());
  readonly canConfirm = () => this.payMethod() === 'card' || this.received() >= this.netTotal();

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
    }, this.selectedDiscount()?.id ?? null, {
      // Snapshot used to build the local receipt when the order is queued offline.
      id: `LOC-${Date.now()}`,
      total: this.netTotal(),
      discountAmount: Math.max(0, this.total() - this.netTotal()),
      discountName: this.selectedDiscount()?.name ?? null,
      amountReceived: this.payMethod() === 'cash' ? this.received() : null,
      changeGiven: this.payMethod() === 'cash' ? Math.max(0, this.received() - this.netTotal()) : null
    }).subscribe({
      next: (order) => {
        this.busy.set(false);
        this.paymentOpen.set(false);
        this.cart.set([]);
        this.selectedDiscount.set(null);
        this.load();
        this.lastOrder.set(order);
        this.lastReceipt.set(order);
        this.sound.orderComplete();
      },
      error: (e) => {
        this.busy.set(false);
        this.dialog.toast(e.error?.error || 'Checkout failed', 'error');
        this.load();
      }
    });
  }

  closeReceipt() { this.lastOrder.set(null); this.showComplete(); }

  // One-tap reprint of the last receipt (customer asks for a copy).
  reprintLast() {
    if (!this.lastReceipt()) { this.dialog.toast('No receipt yet', 'info'); return; }
    this.lastOrder.set(this.lastReceipt());
  }

  // Print the current receipt: native app uses the Android print framework
  // (any printer the device can reach, incl. Bluetooth thermal with a print
  // service); web falls back to the system print dialog.
  printReceipt() {
    const el = this.receiptBox?.nativeElement?.querySelector('.receipt-print') as HTMLElement | null;
    if (!el) { this.dialog.toast('Receipt not ready', 'error'); return; }
    void this.printer.printReceiptHtml(el.outerHTML).then(ok => {
      if (!ok) { this.dialog.toast('No printer available - opening system print', 'error'); window.print(); }
    });
  }

  // Brief success moment, then straight back to a clean POS.
  private showComplete() {
    this.complete.set(true);
    setTimeout(() => this.complete.set(false), 1600);
  }
}
