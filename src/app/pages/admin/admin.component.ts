import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MenuItemService } from '../../menu-item.service';
import { MenuItem } from '../../menu-item.model';
import { BtnComponent } from '../../btn.component';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, BtnComponent],
  template: `
    <div class="admin">
      <!-- Tabs -->
      <div class="tabs">
        <button class="tab" [class.active]="tab() === 'inventory'" (click)="tab.set('inventory')">Inventory</button>
        <button class="tab" [class.active]="tab() === 'users'" (click)="tab.set('users')">Users</button>
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
              <div class="field"><label>Category</label><input [(ngModel)]="fCategory" placeholder="e.g. Hot Drinks" /></div>
              <div class="field"><label>Price (ZAR)</label><input type="number" step="0.01" [(ngModel)]="fPrice" placeholder="0.00" /></div>
              <div class="field"><label>Stock</label><input type="number" [(ngModel)]="fStock" placeholder="0" /></div>
              <div class="field wide"><label>Description</label><input [(ngModel)]="fDesc" placeholder="Short description" /></div>
              <div class="field chk"><label class="checkbox"><input type="checkbox" [(ngModel)]="fAvail" /> <span>Available</span></label></div>
            </div>
            <div class="form-acts">
              <app-btn size="sm" (onClick)="closeForm()">Cancel</app-btn>
              <app-btn variant="primary" size="sm" (onClick)="save()">Save changes</app-btn>
            </div>
          </div>
        }

        <!-- Table -->
        <div class="table-card">
          <table>
            <thead>
              <tr><th>Item</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              @for (item of items(); track item.id) {
                <tr>
                  <td>
                    <div class="cell-item">
                      @if (item.imageUrl) { <img [src]="item.imageUrl" alt="" class="thumb" /> }
                      <div class="cell-info">
                        <span class="cell-name">{{ item.name }}</span>
                        @if (item.description) { <span class="cell-desc">{{ item.description }}</span> }
                      </div>
                    </div>
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
              <div class="field"><label>Password</label><input type="password" [(ngModel)]="uPass" placeholder="Min 6 chars" /></div>
              <div class="field"><label>Display name</label><input [(ngModel)]="uDisplay" placeholder="e.g. Jane" /></div>
              <div class="field"><label>Role</label><select [(ngModel)]="uRole" class="sel"><option value="cashier">Cashier</option><option value="admin">Admin</option></select></div>
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
                  <td><span class="pill">{{ u.role }}</span></td>
                  <td class="cell-acts"><app-btn size="sm" variant="danger" (onClick)="removeUser(u.id)">Delete</app-btn></td>
                </tr>
              }
            </tbody>
          </table>
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

    /* ── Metrics ── */
    .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.75rem; margin-bottom: 1.5rem; }
    .metric { background: var(--surface); border: 1px solid var(--border); border-radius: 1em; padding: 1.1em; }
    .m-val { font-size: 1.35rem; font-weight: 800; color: var(--accent-2); letter-spacing: -0.02em; line-height: 1.2; }
    .m-lbl { font-size: 0.68rem; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; margin-top: 0.15em; }

    /* ── Form sheet ── */
    .form-sheet { background: var(--surface); border: 1px solid var(--accent); border-radius: 1.25em; padding: 1.25em; margin-bottom: 1.25rem; box-shadow: 0 4px 20px rgba(111,78,55,0.1); }
    .form-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1em; }
    .form-head h3 { margin: 0; font-size: 0.9375rem; font-weight: 700; color: var(--accent-2); }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.85em; }
    .field { display: flex; flex-direction: column; gap: 0.3em; }
    .field.wide { grid-column: 1 / -1; }
    .field.chk { justify-content: flex-end; }
    .field label { font-size: 0.68rem; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .field input:not([type]) { padding: 0.6em 0.8em; border: 0.125em solid var(--border); border-radius: 0.75em; font-size: 0.85rem; font-family: inherit; color: var(--text); background: var(--surface); outline: none; transition: border-color 300ms cubic-bezier(.23,1,0.32,1); }
    .field input:focus { border-color: var(--accent); }
    .checkbox { display: flex; align-items: center; gap: 0.4em; font-size: 0.8125rem !important; text-transform: none !important; cursor: pointer; user-select: none; }
    .checkbox input { width: 1.1em; height: 1.1em; accent-color: var(--accent-2); }
    .sel { padding: 0.6em 0.8em; border: 0.125em solid var(--border); border-radius: 0.75em; font-size: 0.85rem; font-family: inherit; background: var(--surface); color: var(--text); outline: none; }
    .form-acts { display: flex; gap: 0.5em; justify-content: flex-end; margin-top: 1em; }

    /* ── Table card ── */
    .table-card { background: var(--surface); border: 1px solid var(--border); border-radius: 1.25em; overflow: hidden; }
    table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
    th { padding: 0.75em 1em; text-align: left; font-size: 0.68rem; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; background: var(--surface-2); border-bottom: 1px solid var(--border); }
    td { padding: 0.7em 1em; border-bottom: 1px solid var(--border); vertical-align: middle; }
    tr:last-child td { border: 0; }

    .cell-item { display: flex; align-items: center; gap: 0.75em; }
    .thumb { width: 36px; height: 36px; border-radius: 0.6em; object-fit: cover; flex-shrink: 0; background: #f0e8de; }
    .cell-info { display: flex; flex-direction: column; gap: 0.1em; }
    .cell-name { font-weight: 700; }
    .cell-desc { font-size: 0.72rem; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px; }

    .num { font-variant-numeric: tabular-nums; font-weight: 600; }
    .pill { display: inline-block; background: var(--accent-light); color: var(--accent-2); font-size: 0.68rem; font-weight: 600; padding: 0.15em 0.6em; border-radius: 100px; }
    .stock { font-weight: 700; font-variant-numeric: tabular-nums; }
    .stock.low { color: var(--accent); }
    .stock.out { color: var(--red); }
    .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: var(--muted); }
    .dot.on { background: var(--green); }
    .cell-acts { display: flex; gap: 0.4em; justify-content: flex-end; }
  `]
})
export class AdminComponent implements OnInit {
  private service = inject(MenuItemService);
  readonly tab = signal<'inventory' | 'users'>('inventory');

  // Inventory
  readonly items = signal<MenuItem[]>([]);
  readonly summary = signal<any>(null);
  readonly showForm = signal(false);
  readonly editing = signal<MenuItem | null>(null);
  fName = ''; fCategory = ''; fPrice: number | null = null; fStock: number | null = null; fDesc = ''; fAvail = true;

  // Users
  readonly users = signal<any[]>([]);
  readonly showUserForm = signal(false);
  uName = ''; uPass = ''; uDisplay = ''; uRole: 'cashier' | 'admin' = 'cashier';

  ngOnInit() { this.loadInv(); this.loadSum(); this.loadUsers(); }

  private loadInv() { this.service.getItems().subscribe(items => this.items.set(items)); }
  private loadSum() { this.service.getSummary().subscribe(s => this.summary.set(s)); }
  private loadUsers() { this.service.getUsers().subscribe(users => this.users.set(users)); }

  openNew() { this.resetInv(); this.showForm.set(true); }
  edit(item: MenuItem) { this.editing.set(item); this.fName = item.name; this.fCategory = item.category; this.fPrice = item.price; this.fStock = item.stockQuantity; this.fDesc = item.description ?? ''; this.fAvail = item.isAvailable; this.showForm.set(true); }
  closeForm() { this.showForm.set(false); this.editing.set(null); }
  save() { this.service.writeItem({ id: this.editing()?.id ?? 0, name: this.fName, category: this.fCategory, price: this.fPrice ?? 0, stockQuantity: this.fStock ?? 0, description: this.fDesc || null, isAvailable: this.fAvail }).subscribe({ next: () => { this.loadInv(); this.closeForm(); }, error: () => alert('Save failed') }); }
  remove(id: number) { if (confirm('Delete this item?')) this.service.deleteItem(id).subscribe({ next: () => this.loadInv() }); }
  private resetInv() { this.fName = ''; this.fCategory = ''; this.fPrice = null; this.fStock = null; this.fDesc = ''; this.fAvail = true; }

  openUserForm() { this.resetUser(); this.showUserForm.set(true); }
  closeUserForm() { this.showUserForm.set(false); }
  saveUser() { this.service.createUser({ username: this.uName, password: this.uPass, displayName: this.uDisplay, role: this.uRole }).subscribe({ next: () => { this.loadUsers(); this.closeUserForm(); }, error: (e) => alert(e.error?.error || 'Save failed') }); }
  removeUser(id: number) { if (confirm('Delete this user?')) this.service.deleteUser(id).subscribe({ next: () => this.loadUsers() }); }
  private resetUser() { this.uName = ''; this.uPass = ''; this.uDisplay = ''; this.uRole = 'cashier'; }
}
