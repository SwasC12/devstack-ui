import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MenuItemService } from '../../menu-item.service';
import { MenuItem } from '../../menu-item.model';
import { Category } from '../../category.model';
import { AuthService } from '../../auth.service';
import { BtnComponent } from '../../btn.component';
import { PasswordInputComponent } from '../../password-input.component';
import { DialogService } from '../../dialog.service';
import { ReceiptViewComponent } from '../../receipt-view.component';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, BtnComponent, PasswordInputComponent, ReceiptViewComponent],
  template: `
    <div class="admin">
      <!-- Tabs -->
      <div class="tabs">
        <button class="tab" [class.active]="tab() === 'inventory'" (click)="tab.set('inventory')">Inventory</button>
        <button class="tab" [class.active]="tab() === 'categories'" (click)="tab.set('categories')">Categories</button>
        <button class="tab" [class.active]="tab() === 'users'" (click)="tab.set('users')">Users</button>
        <button class="tab" [class.active]="tab() === 'orders'" (click)="tab.set('orders')">Orders</button>
        <button class="tab" [class.active]="tab() === 'analytics'" (click)="openAnalytics()">Analytics</button>
        <button class="tab" [class.active]="tab() === 'discounts'" (click)="tab.set('discounts')">Discounts</button>
        <button class="tab" [class.active]="tab() === 'settings'" (click)="tab.set('settings')">Settings</button>
      </div>

      <!-- ───── INVENTORY ───── -->
      @if (tab() === 'inventory') {
        <div class="section-head">
          <h2 class="page-title">Inventory</h2>
          <app-btn variant="primary" (onClick)="openNew()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New item
          </app-btn>
        </div>

        <!-- Metrics -->
        @if (summary(); as s) {
          <div class="metrics">
            <div class="metric">
              <div class="m-val">R{{ s.todayRevenue | number:'1.2-2' }}</div>
              <div class="m-lbl">Today</div>
            </div>
            <div class="metric">
              <div class="m-val">{{ s.todayOrders }}</div>
              <div class="m-lbl">Orders today</div>
            </div>
            <div class="metric">
              <div class="m-val">R{{ s.totalRevenue | number:'1.2-2' }}</div>
              <div class="m-lbl">All time</div>
            </div>
            <div class="metric">
              <div class="m-val">{{ s.totalOrders }}</div>
              <div class="m-lbl">Total orders</div>
            </div>
          </div>
        }

        <!-- Form slide-down -->
        @if (showForm()) {
          <div class="form-sheet">
            <div class="form-head">
              <h3>{{ editing() ? 'Edit' : 'New' }} item</h3>
              <app-btn size="sm" (onClick)="closeForm()">✕</app-btn>
            </div>
            <div class="form-grid">
              <div class="field"><label>Name</label><input [(ngModel)]="fName" placeholder="e.g. Cappuccino" /></div>
              <div class="field">
                <label>Category</label>
                <select [(ngModel)]="fCategory" class="sel">
                  <option value="" disabled>Select category…</option>
                  @for (cat of categoryOptions(); track cat) {
                    <option [value]="cat">{{ cat }}</option>
                  }
                </select>
              </div>
              <div class="field"><label>Price (ZAR)</label><input type="number" step="0.01" [(ngModel)]="fPrice" placeholder="0.00" /></div>
              <div class="field"><label>Stock</label><input type="number" [(ngModel)]="fStock" placeholder="0" /></div>
              <div class="field wide"><label>Description</label><input [(ngModel)]="fDesc" placeholder="Short description" /></div>
              <div class="field wide">
                <label>Sizes (optional) — different sizes, different prices</label>
                @for (sz of fSizes; track $index) {
                  <div class="size-row">
                    <input class="size-name" [(ngModel)]="sz.name" placeholder="e.g. Small" />
                    <input class="size-price" type="number" step="0.01" [(ngModel)]="sz.price" placeholder="0.00" />
                    <app-btn size="sm" variant="danger" (onClick)="removeSizeRow($index)">✕</app-btn>
                  </div>
                }
                <app-btn size="sm" (onClick)="addSizeRow()">+ Add size</app-btn>
              </div>
              <div class="field wide">
                <label>Modifiers (optional) — e.g. Milk, Extras</label>
                @for (g of fGroups; track $index) {
                  <div class="mod-group">
                    <div class="mod-group-head">
                      <input [(ngModel)]="g.name" placeholder="Group name e.g. Milk" />
                      <label class="checkbox"><input type="checkbox" [(ngModel)]="g.isMulti" /> <span>Multiple</span></label>
                      <app-btn size="sm" variant="danger" (onClick)="removeGroup($index)">✕</app-btn>
                    </div>
                    @for (m of g.modifiers; track $index) {
                      <div class="mod-row">
                        <input [(ngModel)]="m.name" placeholder="e.g. Oat" />
                        <input class="mod-delta" type="number" step="0.01" [(ngModel)]="m.priceDelta" placeholder="+0.00" />
                        <app-btn size="sm" variant="danger" (onClick)="removeMod(g, $index)">✕</app-btn>
                      </div>
                    }
                    <app-btn size="sm" (onClick)="addMod(g)">+ Option</app-btn>
                  </div>
                }
                <app-btn size="sm" (onClick)="addGroup()">+ Modifier group</app-btn>
              </div>
              <div class="field wide">
                <label>Photo</label>
                <div class="img-upload">
                  @if (fImageUrl) {
                    <img [src]="fImageUrl" alt="" class="img-preview" />
                  }
                  <input type="file" accept="image/*" (change)="onImageSelected($event)" #fileInput hidden />
                  <app-btn size="sm" (onClick)="fileInput.click()" [loading]="uploading()">
                    {{ fImageUrl ? 'Change' : 'Upload' }}
                  </app-btn>
                  @if (fImageUrl) {
                    <app-btn size="sm" variant="danger" (onClick)="clearImage()">Remove</app-btn>
                  }
                </div>
              </div>
              <div class="field chk"><label class="checkbox"><input type="checkbox" [(ngModel)]="fAvail" /> <span>Available</span></label></div>
            </div>
            <div class="form-acts">
              <app-btn size="sm" (onClick)="closeForm()">Cancel</app-btn>
              <app-btn variant="primary" size="sm" (onClick)="save()">Save changes</app-btn>
            </div>
          </div>
        }

        <!-- Table -->
        <div class="inv-toolbar">
          <input class="inv-search" [(ngModel)]="invQuery" placeholder="Search items…" />
          <div class="inv-filters">
            <button class="chip" [class.on]="invFilter() === 'all'" (click)="invFilter.set('all')">All</button>
            <button class="chip" [class.on]="invFilter() === 'low'" (click)="invFilter.set('low')">Low stock</button>
            <button class="chip" [class.on]="invFilter() === 'out'" (click)="invFilter.set('out')">Out</button>
          </div>
          @if (invQuery.trim() || invFilter() !== 'all') {
            <span class="inv-count">{{ filteredItems().length }} of {{ items().length }}</span>
          }
        </div>
        <div class="table-card">
          <table>
            <thead>
              <tr><th>Item</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              @for (item of filteredItems(); track item.id) {
                <tr>
                  <td class="cell-name">
                    @if (item.imageUrl) { <img [src]="item.imageUrl" alt="" class="thumb" /> }
                    <span>{{ item.name }}</span>
                  </td>
                  <td><span class="pill">{{ item.category }}</span></td>
                  <td class="num">R{{ item.price | number:'1.2-2' }}</td>
                  <td><span class="stock" [class.low]="item.stockQuantity < 10" [class.out]="item.stockQuantity < 1">{{ item.stockQuantity }}</span></td>
                  <td><span class="dot" [class.on]="item.isAvailable"></span></td>
                  <td class="cell-acts">
                    <app-btn size="sm" (onClick)="edit(item)">Edit</app-btn>
                    <app-btn size="sm" variant="danger" (onClick)="remove(item.id)">Delete</app-btn>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <!-- ───── CATEGORIES ───── -->
      @if (tab() === 'categories') {
        <div class="section-head">
          <h2 class="page-title">Categories</h2>
          <app-btn variant="primary" (onClick)="openCatForm()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New category
          </app-btn>
        </div>

        @if (showCatForm()) {
          <div class="form-sheet">
            <div class="form-head">
              <h3>{{ editingCat() ? 'Rename' : 'New' }} category</h3>
              <app-btn size="sm" (onClick)="closeCatForm()">✕</app-btn>
            </div>
            <div class="form-grid">
              <div class="field"><label>Name</label><input [(ngModel)]="catName" placeholder="e.g. Hot Drinks" (keyup.enter)="saveCat()" /></div>
            </div>
            <div class="form-acts">
              <app-btn size="sm" (onClick)="closeCatForm()">Cancel</app-btn>
              <app-btn variant="primary" size="sm" (onClick)="saveCat()">{{ editingCat() ? 'Save' : 'Create category' }}</app-btn>
            </div>
          </div>
        }

        <div class="table-card">
          <table class="cats">
            <thead><tr><th>Name</th><th>Created</th><th></th></tr></thead>
            <tbody>
              @for (cat of categories(); track cat.id) {
                <tr>
                  <td><strong>{{ cat.name }}</strong></td>
                  <td>{{ cat.createdAt | date:'mediumDate' }}</td>
                  <td class="cell-acts">
                    <app-btn size="sm" (onClick)="editCat(cat)">Rename</app-btn>
                    <app-btn size="sm" variant="danger" (onClick)="removeCat(cat)">Delete</app-btn>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="3" style="color:var(--muted);text-align:center;padding:1.5rem;">No categories yet — create one, then add items.</td></tr>
              }
            </tbody>
          </table>
        </div>
      }

      <!-- ───── USERS ───── -->
      @if (tab() === 'users') {
        <div class="section-head">
          <h2 class="page-title">Users</h2>
          <app-btn variant="primary" (onClick)="openUserForm()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New user
          </app-btn>
        </div>

        @if (showUserForm()) {
          <div class="form-sheet">
            <div class="form-head">
              <h3>New user</h3>
              <app-btn size="sm" (onClick)="closeUserForm()">✕</app-btn>
            </div>
            <div class="form-grid">
              <div class="field"><label>Username</label><input [(ngModel)]="uName" placeholder="e.g. cashier1" /></div>
              <div class="field"><label>Password</label><app-password [(ngModel)]="uPass" placeholder="Min 10 · upper + lower + digit" autocomplete="new-password" /></div>
              <div class="field"><label>Display name</label><input [(ngModel)]="uDisplay" placeholder="e.g. Jane" /></div>
              <div class="field"><label>Role</label><select [(ngModel)]="uRole" class="sel"><option value="cashier">Cashier</option><option value="admin">Admin</option></select></div>
              <div class="field"><label>PIN (optional)</label><app-password [pin]="true" [maxlength]="6" inputmode="numeric" [(ngModel)]="uPin" placeholder="4–6 digits" /></div>
            </div>
            <div class="form-acts">
              <app-btn size="sm" (onClick)="closeUserForm()">Cancel</app-btn>
              <app-btn variant="primary" size="sm" (onClick)="saveUser()">Create user</app-btn>
            </div>
          </div>
        }

        <div class="table-card">
          <table>
            <thead><tr><th>Username</th><th>Display name</th><th>Role</th><th></th></tr></thead>
            <tbody>
              @for (u of users(); track u.id) {
                <tr>
                  <td><strong>{{ u.username }}</strong></td>
                  <td>{{ u.displayName }}</td>
                  <td><span class="pill">{{ u.role }}</span> @if (u.hasPin) { <span class="pill pin">PIN ✓</span> }</td>
                  <td class="cell-acts">
                    <app-btn size="sm" (onClick)="setPin(u)">{{ u.hasPin ? 'Change PIN' : 'Set PIN' }}</app-btn>
                    <app-btn size="sm" variant="danger" (onClick)="removeUser(u.id)">Delete</app-btn>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <!-- ───── ORDERS ───── -->
      @if (tab() === 'orders') {        <div class="section-head">
          <h2 class="page-title">Orders</h2>
          <app-btn size="sm" (onClick)="loadOrders()" [loading]="ordersBusy()">Refresh</app-btn>
        </div>

        @if (selectedOrder(); as o) {
          <div class="form-sheet">
            <div class="form-head">
              <h3>Order #{{ o.id }} · {{ o.createdAt | date:'short' }}</h3>
              <app-btn size="sm" (onClick)="selectedOrder.set(null)">✕</app-btn>
            </div>
            <div class="order-meta">
              <span>Cashier: <strong>{{ o.cashierName || '—' }}</strong></span>
              <span>Status: <span class="status-pill" [class.voided]="o.voidedAt">{{ o.voidedAt ? 'Voided' : 'Paid' }}</span></span>
              @if (o.voidedAt) {
                <span class="void-reason">Reason: {{ o.voidReason }}</span>
              }
            </div>
            <div class="order-items">
              @for (line of o.items; track line.id) {
                <div class="order-line">
                  <span class="ol-name">{{ line.quantity }} × {{ line.name }}{{ line.sizeName ? ' (' + line.sizeName + ')' : '' }}{{ lineMods(line) ? ' (' + lineMods(line) + ')' : '' }}</span>
                  <span class="ol-price">R{{ (line.price * line.quantity) | number:'1.2-2' }}</span>
                </div>
                @if (line.note) { <div class="ol-note">📝 {{ line.note }}</div> }
              }
            </div>
            <div class="order-total"><span>Total</span><strong>R{{ o.total | number:'1.2-2' }}</strong></div>
            <div class="ol-vat"><span>VAT (15% incl.)</span><span>R{{ vatOf(o.total) | number:'1.2-2' }}</span></div>
            @if (o.customerName || o.customerPhone) {
              <div class="ol-note">👤 {{ o.customerName || '—' }}{{ o.customerPhone ? ' · ' + o.customerPhone : '' }}</div>
            }
            @if (o.notes) { <div class="ol-note">📝 {{ o.notes }}</div> }
            <div class="order-meta">
              <span>Payment: <strong>{{ o.paymentMethod === 'cash' ? 'Cash' : 'Card' }}</strong></span>
              @if (o.paymentMethod === 'cash' && o.changeGiven != null) {
                <span>Change: <strong>R{{ o.changeGiven | number:'1.2-2' }}</strong></span>
              }
            </div>
            <div class="form-acts">
              <app-btn size="sm" (onClick)="receiptOrder.set(o)">Print receipt</app-btn>
              @if (!o.voidedAt) {
                <app-btn variant="danger" size="sm" (onClick)="voidOrder(o)">Void order</app-btn>
              }
            </div>
          </div>
        }

        <div class="table-card">
          <table class="orders">            <thead><tr><th>Order</th><th>Time</th><th>Cashier</th><th>Items</th><th>Total</th><th>Status</th></tr></thead>
            <tbody>
              @for (o of orders(); track o.id) {
                <tr class="order-row" [class.row-voided]="o.voidedAt" (click)="selectedOrder.set(o)">
                  <td><strong>#{{ o.id }}</strong></td>
                  <td>{{ o.createdAt | date:'short' }}</td>
                  <td>{{ o.cashierName || '—' }}</td>
                  <td>{{ o.items.length }}</td>
                  <td class="num">R{{ o.total | number:'1.2-2' }}</td>
                  <td><span class="status-pill" [class.voided]="o.voidedAt">{{ o.voidedAt ? 'Voided' : 'Paid' }}</span></td>
                </tr>
              } @empty {
                <tr><td colspan="6" style="color:var(--muted);text-align:center;padding:1.5rem;">No orders yet.</td></tr>
              }
            </tbody>
          </table>
        </div>
        <!-- Receipt reprint overlay -->
        @if (receiptOrder(); as ro) {
          <div class="print-scrim" (click)="receiptOrder.set(null)">
            <div class="print-panel" (click)="$event.stopPropagation()">
              <app-receipt [order]="ro" [shop]="shopInfo" [cashierName]="ro.cashierName" />
              <div class="form-acts"><app-btn size="sm" (onClick)="receiptOrder.set(null)">Close</app-btn></div>
            </div>
          </div>
        }
      }

      <!-- ───── ANALYTICS ───── -->
      @if (tab() === 'analytics') {
        <div class="section-head">
          <h2 class="page-title">Analytics</h2>
          <div class="periods">
            @for (d of [7, 14, 30, 90]; track d) {
              <button class="chip" [class.on]="analyticsDays() === d" (click)="loadAnalytics(d)">{{ d }}d</button>
            }
          </div>
        </div>

        @if (analytics(); as a) {
          <div class="metrics">
            <div class="metric"><div class="m-val">R{{ a.totals.revenue | number:'1.2-2' }}</div><div class="m-lbl">Revenue</div></div>
            <div class="metric"><div class="m-val">{{ a.totals.orders }}</div><div class="m-lbl">Orders</div></div>
            <div class="metric"><div class="m-val">{{ a.totals.items }}</div><div class="m-lbl">Items sold</div></div>
          </div>

          <!-- Daily revenue bars -->
          @if (a.daily.length) {
            <div class="chart-card">
              <div class="chart">
                @for (day of a.daily; track day.date) {
                  <div class="bar-col" [title]="day.date + ' · R' + (day.revenue | number:'1.2-2')">
                    <div class="bar" [style.height.%]="barPct(day.revenue, a.daily)"></div>
                    <span class="bar-lbl">{{ day.date.slice(5) }}</span>
                  </div>
                }
              </div>
            </div>
          } @else {
            <p class="hint" style="margin:1rem 0;">No sales in this period yet.</p>
          }

          <div class="split">
            <div class="table-card">
              <h3 class="sub-h">By cashier</h3>
              <table class="simple">
                <thead><tr><th>Cashier</th><th>Orders</th><th>Revenue</th></tr></thead>
                <tbody>
                  @for (c of a.cashiers; track c.name) {
                    <tr><td><strong>{{ c.name }}</strong></td><td>{{ c.orders }}</td><td class="num">R{{ c.revenue | number:'1.2-2' }}</td></tr>
                  } @empty {
                    <tr><td colspan="3" class="muted-td">No sales yet.</td></tr>
                  }
                </tbody>
              </table>
            </div>
            <div class="table-card">
              <h3 class="sub-h">By category</h3>
              <table class="simple">
                <thead><tr><th>Category</th><th>Qty</th><th>Revenue</th></tr></thead>
                <tbody>
                  @for (c of a.categories; track c.name) {
                    <tr><td><strong>{{ c.name }}</strong></td><td>{{ c.quantity }}</td><td class="num">R{{ c.revenue | number:'1.2-2' }}</td></tr>
                  } @empty {
                    <tr><td colspan="3" class="muted-td">No sales yet.</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        } @else {
          <p class="hint">Loading analytics…</p>
        }
      }

      <!-- ───── DISCOUNTS / SPECIALS ───── -->
      @if (tab() === 'discounts') {
        <div class="section-head">
          <h2 class="page-title">Discounts & specials</h2>
          <app-btn variant="primary" (onClick)="openDiscForm()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New discount
          </app-btn>
        </div>

        @if (showDiscForm()) {
          <div class="form-sheet">
            <div class="form-head">
              <h3>{{ editingDisc() ? 'Edit' : 'New' }} discount</h3>
              <app-btn size="sm" (onClick)="closeDiscForm()">✕</app-btn>
            </div>
            <div class="form-grid">
              <div class="field"><label>Name</label><input [(ngModel)]="dName" placeholder="e.g. Happy hour" /></div>
              <div class="field">
                <label>Type</label>
                <select [(ngModel)]="dType" class="sel">
                  <option value="percent">% off</option>
                  <option value="fixed">R off</option>
                </select>
              </div>
              <div class="field"><label>{{ dType === 'percent' ? 'Percent off' : 'Rand off' }}</label><input type="number" step="0.01" [(ngModel)]="dValue" placeholder="0" /></div>
              <div class="field">
                <label>Day</label>
                <select [(ngModel)]="dDay" class="sel">
                  <option [ngValue]="null">Every day</option>
                  @for (day of ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']; track day; let i = $index) {
                    <option [ngValue]="i">{{ day }}</option>
                  }
                </select>
              </div>
              <div class="field"><label>From (optional)</label><input type="time" [(ngModel)]="dStart" /></div>
              <div class="field"><label>Until (optional)</label><input type="time" [(ngModel)]="dEnd" /></div>
              <div class="field chk"><label class="checkbox"><input type="checkbox" [(ngModel)]="dActive" /> <span>Active</span></label></div>
            </div>
            <div class="form-acts">
              <app-btn size="sm" (onClick)="closeDiscForm()">Cancel</app-btn>
              <app-btn variant="primary" size="sm" (onClick)="saveDisc()">Save</app-btn>
            </div>
          </div>
        }

        <div class="table-card">
          <table class="discs">
            <thead><tr><th>Name</th><th>Value</th><th>Schedule</th><th>Status</th><th></th></tr></thead>
            <tbody>
              @for (d of discounts(); track d.id) {
                <tr>
                  <td><strong>{{ d.name }}</strong></td>
                  <td>{{ d.type === 'percent' ? d.value + '%' : 'R' + (d.value | number:'1.2-2') }}</td>
                  <td class="muted">{{ discSchedule(d) }}</td>
                  <td>
                    <span class="status-pill" [class.live]="d.isLive">{{ d.isLive ? 'Live now' : d.isActive ? 'Scheduled' : 'Off' }}</span>
                  </td>
                  <td class="cell-acts">
                    <app-btn size="sm" (onClick)="editDisc(d)">Edit</app-btn>
                    <app-btn size="sm" variant="danger" (onClick)="removeDisc(d)">Delete</app-btn>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="5" class="muted-td">No discounts yet — add one, e.g. a happy hour special.</td></tr>
              }
            </tbody>
          </table>
        </div>
      }

      <!-- ───── SETTINGS ───── -->
      @if (tab() === 'settings') {
        <div class="section-head">
          <h2 class="page-title">Settings</h2>
        </div>

        <div class="form-sheet">
          <div class="form-head"><h3>Account</h3></div>
          <p class="hint">Your login details. Changes apply system-wide — next login uses these.</p>
          <div class="form-grid">
            <div class="field"><label>Username</label><input [(ngModel)]="acUsername" /></div>
            <div class="field"><label>Display name</label><input [(ngModel)]="acDisplay" /></div>
            <div class="field"><label>Current password</label><app-password [(ngModel)]="acCurrent" autocomplete="current-password" /></div>
            <div class="field"><label>New password (optional)</label><app-password [(ngModel)]="acNew" autocomplete="new-password" /></div>
          </div>
          @if (acMsg()) { <p class="form-msg" [class.err]="acErr()">{{ acMsg() }}</p> }
          <div class="form-acts">
            <app-btn variant="primary" size="sm" (onClick)="saveAccount()" [loading]="acBusy()">Save account</app-btn>
          </div>
        </div>

        <div class="form-sheet">
          <div class="form-head"><h3>Shop branding</h3></div>
          <p class="hint">Your logo appears in the POS.</p>
          <div class="form-grid">
            <div class="field"><label>Shop name</label><input [(ngModel)]="brName" /></div>
            <div class="field wide">
              <label>Logo</label>
              <div class="img-upload">
                @if (brLogoUrl) { <img [src]="brLogoUrl" alt="" class="img-preview" /> }
                <input type="file" accept="image/*" (change)="onLogoSelected($event)" #logoInput hidden />
                <app-btn size="sm" (onClick)="logoInput.click()" [loading]="logoUploading()">{{ brLogoUrl ? 'Change' : 'Upload' }}</app-btn>
                @if (brLogoUrl) { <app-btn size="sm" variant="danger" (onClick)="brLogoUrl = ''">Remove</app-btn> }
              </div>
            </div>
            <div class="field wide">
              <label>Receipt QR link (optional)</label>
              <input [(ngModel)]="brQrUrl" placeholder="https://wa.me/27821234567 or a review / feedback link" />
              <span class="field-hint">Shown as a scannable QR on printed receipts. Leave empty to hide it.</span>
            </div>
          </div>
          @if (brMsg()) { <p class="form-msg" [class.err]="brErr()">{{ brMsg() }}</p> }
          <div class="form-acts">
            <app-btn variant="primary" size="sm" (onClick)="saveBranding()" [loading]="brBusy()">Save branding</app-btn>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .admin { max-width: 960px; }

    /* ── Tabs ── */
    .tabs { display: flex; gap: 0; margin-bottom: 1.5rem; border-bottom: 0.125em solid var(--border); }
    .tab { padding: 0.65em 1.5em; border: 0; background: transparent; font-size: 0.8125rem; font-weight: 600; color: var(--muted); cursor: pointer; border-bottom: 0.125em solid transparent; margin-bottom: -0.125em; transition: all 300ms cubic-bezier(.23,1,0.32,1); font-family: inherit; }
    .tab:hover { color: var(--accent-2); }
    .tab.active { color: var(--accent-2); border-color: var(--accent-2); }

    /* ── Section head ── */
    .section-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; }
    .section-head .page-title { margin: 0; }

    /* ── Inventory toolbar ── */
    .inv-toolbar { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; flex-wrap: wrap; }
    .inv-search { flex: 1; max-width: 320px; padding: 0.55rem 0.85rem; border: 1px solid var(--border-hover); border-radius: var(--radius-sm); font-size: 0.85rem; font-family: inherit; color: var(--text); background: var(--surface-2); outline: none; }
    .inv-search:focus { border-color: var(--accent); }
    .inv-filters { display: flex; gap: 0.4rem; }
    .inv-count { font-size: 0.75rem; color: var(--muted); font-weight: 600; }
    .chip { padding: 0.45rem 0.9rem; border: 1px solid var(--border-hover); border-radius: var(--radius-pill); background: var(--surface-2); color: var(--text-2); font-family: inherit; font-size: 0.75rem; font-weight: 700; cursor: pointer; }
    .chip.on { background: var(--accent); border-color: var(--accent); color: #fff; }

    /* ── Analytics ── */
    .periods { display: flex; gap: 0.4rem; }
    .chart-card { background: var(--surface); border: 1px solid var(--border); border-radius: 1.25em; padding: 1.25em; margin-bottom: 1.25rem; overflow-x: auto; }
    .chart { display: flex; align-items: flex-end; gap: 4px; height: 160px; min-width: 420px; }
    .bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; gap: 0.3rem; }
    .bar { width: 100%; max-width: 34px; border-radius: 6px 6px 0 0; background: linear-gradient(180deg, var(--accent-2), var(--accent)); min-height: 2px; transition: height 0.3s ease; }
    .bar-lbl { font-size: 0.6rem; color: var(--muted); white-space: nowrap; transform: rotate(-45deg); }
    .split { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .sub-h { margin: 0.9rem 1rem 0.4rem; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
    table.simple th:nth-child(1) { width: 45%; }
    .muted-td { color: var(--muted); text-align: center; padding: 1.25rem !important; }
    @media (max-width: 720px) { .split { grid-template-columns: 1fr; } }

    /* ── Metrics ── */
    .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.75rem; margin-bottom: 1.5rem; }
    .metric { background: var(--surface); border: 1px solid var(--border); border-radius: 1em; padding: 1.1em; }
    .m-val { font-size: 1.35rem; font-weight: 800; color: var(--accent-2); letter-spacing: -0.02em; line-height: 1.2; }
    .m-lbl { font-size: 0.68rem; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; margin-top: 0.15em; }

    /* ── Form sheet ── */
    .form-sheet { background: var(--surface); border: 1px solid var(--accent); border-radius: 1.25em; padding: 1.25em; margin-bottom: 1.25rem; box-shadow: 0 4px 20px rgba(0,0,0,0.25); }
    .form-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1em; }
    .form-head h3 { margin: 0; font-size: 0.9375rem; font-weight: 700; color: var(--accent-2); }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.85em; }
    .field-hint { font-size: 0.75rem; color: var(--muted); }
    .field { display: flex; flex-direction: column; gap: 0.3em; }
    .field.wide { grid-column: 1 / -1; }
    .field.chk { justify-content: flex-end; }
    .field label { font-size: 0.68rem; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .field input:not([type]) { padding: 0.6em 0.8em; border: 0.125em solid var(--border-hover); border-radius: 0.75em; font-size: 0.85rem; font-family: inherit; color: var(--text); background: var(--surface-2); outline: none; transition: border-color 0.15s; }
    .field input:focus { border-color: var(--accent); }
    .img-upload { display: flex; align-items: center; gap: 0.6em; flex-wrap: wrap; }
    .size-row { display: flex; align-items: center; gap: 0.5em; }
    .size-name { flex: 1; }
    .size-price { width: 90px; }
    .mod-group { border: 1px solid var(--border); border-radius: 0.75em; padding: 0.6em; display: flex; flex-direction: column; gap: 0.45em; background: var(--surface-2); }
    .mod-group-head { display: flex; align-items: center; gap: 0.5em; }
    .mod-group-head input { flex: 1; }
    .mod-group-head .checkbox { display: flex; align-items: center; gap: 0.3em; font-size: 0.78rem; color: var(--text-2); white-space: nowrap; }
    .mod-row { display: flex; align-items: center; gap: 0.5em; }
    .mod-row input { flex: 1; }
    .mod-delta { width: 90px !important; flex: none !important; }
    .img-preview { width: 48px; height: 48px; border-radius: 0.6em; object-fit: cover; border: 1px solid var(--border); }
    .checkbox { display: flex; align-items: center; gap: 0.4em; font-size: 0.8125rem !important; text-transform: none !important; cursor: pointer; user-select: none; }
    .checkbox input { width: 1.1em; height: 1.1em; accent-color: var(--accent-2); }
    .sel { padding: 0.6em 0.8em; border: 0.125em solid var(--border-hover); border-radius: 0.75em; font-size: 0.85rem; font-family: inherit; background: var(--surface-2); color: var(--text); outline: none; }
    .form-acts { display: flex; gap: 0.5em; justify-content: flex-end; margin-top: 1em; }
    .hint { margin: 0 0 1em; font-size: 0.75rem; color: var(--muted); }
    .form-msg { margin: 0.75rem 0 0; font-size: 0.8rem; font-weight: 600; color: var(--green); }
    .form-msg.err { color: var(--red); }

    /* ── Table card ── */
    .table-card { background: var(--surface); border: 1px solid var(--border); border-radius: 1.25em; overflow: hidden; }
    table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 0.8125rem; }
    th { padding: 0.75em 1em; text-align: left; font-size: 0.68rem; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; background: var(--surface-2); border-bottom: 1px solid var(--border); }
    th:first-child { width: 35%; }
    th:nth-child(2) { width: 15%; }
    th:nth-child(3) { width: 12%; }
    th:nth-child(4) { width: 10%; }
    th:nth-child(5) { width: 10%; }
    th:last-child { width: 18%; }
    td { padding: 0.7em 1em; border-bottom: 1px solid var(--border); vertical-align: middle; overflow: hidden; text-overflow: ellipsis; word-break: break-word; }
    tr:last-child td { border: 0; }
    tbody tr:hover td { background: var(--surface-2); }
    th { overflow: hidden; }

    .thumb { width: 28px; height: 28px; border-radius: 0.5em; object-fit: cover; vertical-align: middle; margin-right: 0.5em; background: var(--surface-2); }
    .cell-name { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .num { font-variant-numeric: tabular-nums; font-weight: 600; }
    .pill { display: inline-block; background: var(--accent-light); color: var(--accent-2); font-size: 0.68rem; font-weight: 600; padding: 0.15em 0.6em; border-radius: 100px; }
    .pill.pin { background: var(--green-bg); color: var(--green); margin-left: 0.3em; }
    .stock { font-weight: 700; font-variant-numeric: tabular-nums; }
    .stock.low { color: var(--accent); }
    .stock.out { color: var(--red); }
    .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: var(--muted); }
    .dot.on { background: var(--green); }
    .cell-acts { display: flex; gap: 0.4em; justify-content: flex-end; }

    /* Categories table has fewer, wider columns than inventory. */
    table.cats th:nth-child(1) { width: 40%; }
    table.cats th:nth-child(2) { width: 30%; }
    table.cats th:nth-child(3) { width: 30%; }

    /* ── Orders ── */
    table.orders th:nth-child(1) { width: 10%; }
    table.orders th:nth-child(2) { width: 20%; }
    table.orders th:nth-child(3) { width: 18%; }
    table.orders th:nth-child(4) { width: 10%; }
    table.orders th:nth-child(5) { width: 14%; }
    table.orders th:last-child { width: 12%; }
    .order-row { cursor: pointer; }
    .order-row:hover td { background: var(--surface-2); }
    .row-voided td { opacity: 0.5; }
    .status-pill { display: inline-block; background: var(--green-bg); color: var(--green); font-size: 0.68rem; font-weight: 700; padding: 0.15em 0.6em; border-radius: 100px; }
    .status-pill.live { background: var(--accent-light); color: var(--accent-hover); }
    .status-pill.voided { background: var(--red-bg); color: var(--red); }
    table.discs th:nth-child(1) { width: 26%; }
    table.discs th:nth-child(2) { width: 12%; }
    table.discs th:nth-child(3) { width: 30%; }
    table.discs th:nth-child(4) { width: 12%; }
    table.discs th:last-child { width: 20%; }
    .order-meta { display: flex; gap: 1rem; flex-wrap: wrap; align-items: center; font-size: 0.8125rem; color: var(--text-2); margin-bottom: 0.75rem; }
    .order-meta strong { color: var(--text); }
    .void-reason { color: var(--red); font-weight: 600; }
    .order-items { border-top: 1px solid var(--border); padding-top: 0.5rem; }
    .order-line { display: flex; justify-content: space-between; padding: 0.3rem 0; font-size: 0.8125rem; color: var(--text-2); }
    .ol-price { font-variant-numeric: tabular-nums; color: var(--text); font-weight: 600; }
    .order-total { display: flex; justify-content: space-between; align-items: baseline; border-top: 1px solid var(--border); margin-top: 0.5rem; padding-top: 0.75rem; font-size: 0.9375rem; }
    .order-total strong { font-size: 1.25rem; font-weight: 800; color: var(--text); }

    /* Receipt reprint overlay */
    .print-scrim { position: fixed; inset: 0; background: rgba(10,8,6,0.7); display: flex; align-items: center; justify-content: center; z-index: 900; }
    .print-panel { display: flex; flex-direction: column; align-items: center; gap: 1rem; padding: 1.5rem; }
  `]
})
export class AdminComponent implements OnInit {
  private service = inject(MenuItemService);
  private auth = inject(AuthService);
  private dialog = inject(DialogService);
  readonly tab = signal<'inventory' | 'categories' | 'users' | 'orders' | 'analytics' | 'discounts' | 'settings'>('inventory');

  // Inventory
  readonly items = signal<MenuItem[]>([]);
  invQuery = '';
  readonly invFilter = signal<'all' | 'low' | 'out'>('all');
  readonly LOW_STOCK = 10;
  readonly summary = signal<any>(null);
  readonly showForm = signal(false);
  readonly editing = signal<MenuItem | null>(null);
  fName = ''; fCategory = ''; fPrice: number | null = null; fStock: number | null = null; fDesc = ''; fAvail = true;
  fImageUrl = ''; fImagePublicId = ''; readonly uploading = signal(false);
  fSizes: { id: number; name: string; price: number }[] = [];
  fGroups: { id: number; name: string; isMulti: boolean; modifiers: { id: number; name: string; priceDelta: number }[] }[] = [];

  // Users
  readonly users = signal<any[]>([]);
  readonly showUserForm = signal(false);
  uName = ''; uPass = ''; uDisplay = ''; uRole: 'cashier' | 'admin' = 'cashier'; uPin = '';

  // Categories
  readonly categories = signal<Category[]>([]);
  readonly showCatForm = signal(false);
  readonly editingCat = signal<Category | null>(null);
  catName = '';

  // Settings — account + branding
  acUsername = ''; acDisplay = ''; acCurrent = ''; acNew = '';
  readonly acMsg = signal(''); readonly acErr = signal(false); readonly acBusy = signal(false);
  brName = ''; brLogoUrl = ''; brQrUrl = '';
  readonly brMsg = signal(''); readonly brErr = signal(false); readonly brBusy = signal(false);
  readonly logoUploading = signal(false);

  // Orders
  readonly orders = signal<any[]>([]);

  lineMods(line: any): string {
    return (line.modifiers ?? []).map((m: any) => m.priceDelta > 0 ? `${m.name} +R${m.priceDelta}` : m.name).join(', ');
  }
  vatOf(total: number): number { return Math.round(Number(total) * 15 / 115 * 100) / 100; }
  readonly selectedOrder = signal<any | null>(null);
  readonly receiptOrder = signal<any | null>(null);
  readonly ordersBusy = signal(false);
  shopInfo: any = null;

  // Analytics
  readonly analytics = signal<any | null>(null);
  readonly analyticsDays = signal(14);

  // Discounts / specials
  readonly discounts = signal<any[]>([]);
  readonly showDiscForm = signal(false);
  readonly editingDisc = signal<any | null>(null);
  dName = ''; dType: 'percent' | 'fixed' = 'percent'; dValue: number | null = null;
  dDay: number | null = null; dStart = ''; dEnd = ''; dActive = true;

  ngOnInit() { this.loadInv(); this.loadSum(); this.loadUsers(); this.loadCategories(); this.loadSettings(); this.loadOrders(); this.loadShopInfo(); this.loadDiscounts(); }

  private loadShopInfo() { this.service.getShopInfo().subscribe(s => this.shopInfo = s); }

  private loadInv() { this.service.getItems().subscribe(items => this.items.set(items)); }
  private loadSum() { this.service.getSummary().subscribe(s => this.summary.set(s)); }
  private loadUsers() { this.service.getUsers().subscribe(users => this.users.set(users)); }

  // Live filter over name + category; empty query shows everything.
  filteredItems(): MenuItem[] {
    const q = this.invQuery.trim().toLowerCase();
    const f = this.invFilter();
    return this.items().filter(i => {
      if (q && !(i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q))) return false;
      if (f === 'low' && i.stockQuantity >= this.LOW_STOCK) return false;
      if (f === 'out' && i.stockQuantity >= 1) return false;
      return true;
    });
  }

  openNew() { this.resetInv(); this.showForm.set(true); }
  edit(item: MenuItem) { this.editing.set(item); this.fName = item.name; this.fCategory = item.category; this.fPrice = item.price; this.fStock = item.stockQuantity; this.fDesc = item.description ?? ''; this.fAvail = item.isAvailable; this.fImageUrl = item.imageUrl ?? ''; this.fImagePublicId = item.imagePublicId ?? ''; this.fSizes = (item.sizes ?? []).map(s => ({ id: s.id, name: s.name, price: s.price })); this.fGroups = (item.modifierGroups ?? []).map(g => ({ id: g.id, name: g.name, isMulti: g.isMulti, modifiers: g.modifiers.map(m => ({ id: m.id, name: m.name, priceDelta: m.priceDelta })) })); this.showForm.set(true); }
  closeForm() { this.showForm.set(false); this.editing.set(null); }
  addSizeRow() { this.fSizes = [...this.fSizes, { id: 0, name: '', price: 0 }]; }
  removeSizeRow(i: number) { this.fSizes = this.fSizes.filter((_, idx) => idx !== i); }
  addGroup() { this.fGroups = [...this.fGroups, { id: 0, name: '', isMulti: false, modifiers: [] }]; }
  removeGroup(i: number) { this.fGroups = this.fGroups.filter((_, idx) => idx !== i); }
  addMod(g: { modifiers: { id: number; name: string; priceDelta: number }[] }) { g.modifiers = [...g.modifiers, { id: 0, name: '', priceDelta: 0 }]; }
  removeMod(g: { modifiers: { id: number; name: string; priceDelta: number }[] }, i: number) { g.modifiers = g.modifiers.filter((_, idx) => idx !== i); }
  save() {
    if (!this.fCategory.trim()) { this.dialog.toast('Choose a category', 'error'); return; }
    const sizes = this.fSizes.filter(s => s.name.trim()).map(s => ({ id: s.id, name: s.name.trim(), price: s.price ?? 0 }));
    const modifierGroups = this.fGroups.filter(g => g.name.trim()).map(g => ({
      id: g.id, name: g.name.trim(), isMulti: g.isMulti,
      modifiers: g.modifiers.filter(m => m.name.trim()).map(m => ({ id: m.id, name: m.name.trim(), priceDelta: m.priceDelta ?? 0 }))
    }));
    this.service.writeItem({ id: this.editing()?.id ?? 0, name: this.fName, category: this.fCategory, price: this.fPrice ?? 0, stockQuantity: this.fStock ?? 0, description: this.fDesc || null, imageUrl: this.fImageUrl || null, imagePublicId: this.fImagePublicId || null, isAvailable: this.fAvail, sizes, modifierGroups }).subscribe({ next: () => { this.loadInv(); this.closeForm(); }, error: () => this.dialog.toast('Save failed', 'error') });
  }
  remove(id: number) {
    this.dialog.confirm('Delete item', 'Delete this item?').then(ok => {
      if (ok) this.service.deleteItem(id).subscribe({ next: () => this.loadInv(), error: () => this.dialog.toast('Delete failed', 'error') });
    });
  }
  private resetInv() { this.fName = ''; this.fCategory = ''; this.fPrice = null; this.fStock = null; this.fDesc = ''; this.fAvail = true; this.fImageUrl = ''; this.fImagePublicId = ''; this.fSizes = []; this.fGroups = []; }

  onImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.uploading.set(true);
    this.service.uploadImage(file).subscribe({
      next: ({ url, publicId }) => { this.fImageUrl = url; this.fImagePublicId = publicId; this.uploading.set(false); },
      error: () => { this.uploading.set(false); this.dialog.toast('Upload failed', 'error'); }
    });
  }

  clearImage() { this.fImageUrl = ''; this.fImagePublicId = ''; }

  openUserForm() { this.resetUser(); this.showUserForm.set(true); }
  closeUserForm() { this.showUserForm.set(false); }
  saveUser() { this.service.createUser({ username: this.uName, password: this.uPass, displayName: this.uDisplay, role: this.uRole, pin: this.uPin || null }).subscribe({ next: () => { this.loadUsers(); this.closeUserForm(); }, error: (e) => this.dialog.toast(e.error?.error || 'Save failed', 'error') }); }
  removeUser(id: number) {
    this.dialog.confirm('Delete user', 'Delete this user?').then(ok => {
      if (ok) this.service.deleteUser(id).subscribe({ next: () => this.loadUsers(), error: () => this.dialog.toast('Delete failed', 'error') });
    });
  }
  setPin(u: any) {
    this.dialog.prompt(`Set a ${u.hasPin ? 'new ' : ''}PIN for ${u.displayName}`, '4–6 digits').then(pin => {
      if (!pin) return;
      if (!/^\d{4,6}$/.test(pin)) { this.dialog.toast('PIN must be 4-6 digits', 'error'); return; }
      this.service.setUserPin(u.id, pin).subscribe({
        next: () => this.loadUsers(),
        error: (e) => this.dialog.toast(e.error?.error || 'Failed', 'error')
      });
    });
  }
  private resetUser() { this.uName = ''; this.uPass = ''; this.uDisplay = ''; this.uRole = 'cashier'; this.uPin = ''; }

  // ── Orders ─────────────────────────────────────────────

  loadOrders() {
    this.ordersBusy.set(true);
    this.service.getOrders().subscribe({
      next: (orders) => {
        this.orders.set(orders);
        // Keep the open detail in sync (e.g. after a void elsewhere).
        const sel = this.selectedOrder();
        if (sel) {
          const fresh = orders.find(o => o.id === sel.id);
          this.selectedOrder.set(fresh ?? null);
        }
        this.ordersBusy.set(false);
      },
      error: () => this.ordersBusy.set(false)
    });
  }

  // ── Analytics ─────────────────────────────────────────────

  openAnalytics() {
    this.tab.set('analytics');
    if (!this.analytics()) this.loadAnalytics(this.analyticsDays());
  }

  loadAnalytics(days: number) {
    this.analyticsDays.set(days);
    this.service.getAnalytics(days).subscribe(a => this.analytics.set(a));
  }

  barPct(revenue: number, daily: any[]): number {
    const max = Math.max(...daily.map(d => d.revenue), 1);
    return Math.max(2, Math.round((revenue / max) * 100));
  }

  // ── Discounts / specials ─────────────────────────────────

  private loadDiscounts() { this.service.getDiscounts().subscribe(ds => this.discounts.set(ds)); }

  discSchedule(d: any): string {
    const day = d.dayOfWeek != null ? ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.dayOfWeek] : 'Every day';
    if (!d.startTime && !d.endTime) return day;
    const s = d.startTime ? d.startTime.slice(0, 5) : '';
    const e = d.endTime ? d.endTime.slice(0, 5) : '';
    return `${day} ${s || '—'}–${e || '—'}`;
  }

  openDiscForm() { this.editingDisc.set(null); this.dName = ''; this.dType = 'percent'; this.dValue = null; this.dDay = null; this.dStart = ''; this.dEnd = ''; this.dActive = true; this.showDiscForm.set(true); }
  closeDiscForm() { this.showDiscForm.set(false); this.editingDisc.set(null); }
  editDisc(d: any) {
    this.editingDisc.set(d);
    this.dName = d.name; this.dType = d.type; this.dValue = d.value;
    this.dDay = d.dayOfWeek; this.dStart = d.startTime ?? ''; this.dEnd = d.endTime ?? ''; this.dActive = d.isActive;
    this.showDiscForm.set(true);
  }
  saveDisc() {
    const body: any = {
      id: this.editingDisc()?.id ?? 0,
      name: this.dName,
      type: this.dType,
      value: this.dValue ?? 0,
      isActive: this.dActive,
      dayOfWeek: this.dDay,
      startTime: this.dStart || null,
      endTime: this.dEnd || null
    };
    this.service.writeDiscount(body).subscribe({
      next: () => { this.loadDiscounts(); this.closeDiscForm(); },
      error: (e) => this.dialog.toast(e.error?.error || 'Save failed', 'error')
    });
  }
  removeDisc(d: any) {
    this.dialog.confirm('Delete discount', `Delete "${d.name}"?`).then(ok => {
      if (!ok) return;
      this.service.deleteDiscount(d.id).subscribe({
        next: () => this.loadDiscounts(),
        error: (e) => this.dialog.toast(e.error?.error || 'Delete failed', 'error')
      });
    });
  }

  voidOrder(o: any) {
    this.dialog.prompt('Void order', `Void order #${o.id} (R${o.total.toFixed(2)})? Stock is returned to inventory.`, {
      inputType: 'text',
      placeholder: 'Reason (e.g. wrong order)'
    }).then(reason => {
      const r = reason?.trim();
      if (!r) return;
      this.service.voidOrder(o.id, r).subscribe({
        next: () => {
          this.dialog.toast(`Order #${o.id} voided`, 'success');
          this.loadOrders();
          this.loadSum();
          this.loadInv(); // stock was restored
        },
        error: (e) => this.dialog.toast(e.error?.error || 'Void failed', 'error')
      });
    });
  }

  // ── Categories ────────────────────────────────────────────

  private loadCategories() { this.service.getCategories().subscribe(cats => this.categories.set(cats)); }

  categoryOptions(): string[] {
    const names = this.categories().map(c => c.name);
    // Keep a legacy/unknown category visible so editing an old item still shows it.
    return this.fCategory && !names.includes(this.fCategory) ? [this.fCategory, ...names] : names;
  }

  openCatForm() { this.editingCat.set(null); this.catName = ''; this.showCatForm.set(true); }
  editCat(cat: Category) { this.editingCat.set(cat); this.catName = cat.name; this.showCatForm.set(true); }
  closeCatForm() { this.showCatForm.set(false); this.editingCat.set(null); }

  saveCat() {
    this.service.writeCategory({ id: this.editingCat()?.id ?? 0, name: this.catName }).subscribe({
      next: () => { this.loadCategories(); this.closeCatForm(); },
      error: (e) => this.dialog.toast(e.error?.error || 'Save failed', 'error')
    });
  }

  removeCat(cat: Category) {
    this.dialog.confirm('Delete category', `Delete "${cat.name}"?`).then(ok => {
      if (!ok) return;
      this.service.deleteCategory(cat.id).subscribe({
        next: () => this.loadCategories(),
        error: (e) => this.dialog.toast(e.error?.error || 'Delete failed', 'error')
      });
    });
  }

  // ── Settings ──────────────────────────────────────────────

  private loadSettings() {
    const u = this.auth.getUser();
    this.acUsername = u?.username ?? '';
    this.acDisplay = u?.displayName ?? '';
    this.service.getShopInfo().subscribe(shop => {
      this.brName = shop.name;
      this.brLogoUrl = shop.logoUrl ?? '';
      this.brQrUrl = shop.receiptQrUrl ?? '';
    });
  }

  saveAccount() {
    if (!this.acCurrent) { this.acMsg.set('Enter your current password'); this.acErr.set(true); return; }
    this.acBusy.set(true); this.acErr.set(false); this.acMsg.set('');
    this.auth.updateProfile(this.acCurrent, this.acUsername, this.acDisplay, this.acNew).subscribe({
      next: () => { this.acMsg.set('Account updated.'); this.acErr.set(false); this.acCurrent = ''; this.acNew = ''; this.acBusy.set(false); },
      error: (e) => { this.acMsg.set(e.error?.error || 'Failed'); this.acErr.set(true); this.acBusy.set(false); }
    });
  }

  onLogoSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.logoUploading.set(true);
    this.service.uploadImage(file).subscribe({
      next: ({ url }) => { this.brLogoUrl = url; this.logoUploading.set(false); },
      error: () => { this.logoUploading.set(false); this.dialog.toast('Upload failed', 'error'); }
    });
  }

  saveBranding() {
    this.brBusy.set(true); this.brErr.set(false); this.brMsg.set('');
    this.service.updateShopInfo({ name: this.brName, logoUrl: this.brLogoUrl || null, receiptQrUrl: this.brQrUrl.trim() || null }).subscribe({
      next: () => { this.brMsg.set('Branding saved.'); this.brBusy.set(false); },
      error: (e) => { this.brMsg.set(e.error?.error || 'Failed'); this.brErr.set(true); this.brBusy.set(false); }
    });
  }
}
