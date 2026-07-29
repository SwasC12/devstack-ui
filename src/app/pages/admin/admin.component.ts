import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MenuItemService } from '../../menu-item.service';
import { MenuItem } from '../../menu-item.model';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="admin">
      <!-- Tabs -->
      <div class="tabs">
        <button class="tab" [class.active]="tab() === 'inventory'" (click)="tab.set('inventory')">Inventory</button>
        <button class="tab" [class.active]="tab() === 'users'" (click)="tab.set('users')">Users</button>
      </div>

      <!-- ───── INVENTORY ───── -->
      @if (tab() === 'inventory') {
        <div class="admin-header">
          <h2 class="page-title">Inventory</h2>
          <button class="btn btn-primary" (click)="openNew()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New item
          </button>
        </div>

        @if (summary(); as s) {
          <div class="metrics">
            <div class="metric"><div class="m-value">R{{ s.todayRevenue | number:'1.2-2' }}</div><div class="m-label">Today's revenue</div></div>
            <div class="metric"><div class="m-value">{{ s.todayOrders }}</div><div class="m-label">Orders today</div></div>
            <div class="metric"><div class="m-value">R{{ s.totalRevenue | number:'1.2-2' }}</div><div class="m-label">Total revenue</div></div>
            <div class="metric"><div class="m-value">{{ s.totalOrders }}</div><div class="m-label">All orders</div></div>
          </div>
        }

        @if (showForm()) {
          <div class="form-panel card">
            <div class="form-header">
              <h3>{{ editing() ? 'Edit' : 'New' }} item</h3>
              <button class="btn btn-sm btn-outline" (click)="closeForm()">✕</button>
            </div>
            <div class="form-grid">
              <div class="field"><label>Name</label><input [(ngModel)]="fName" placeholder="e.g. Cappuccino" /></div>
              <div class="field"><label>Category</label><input [(ngModel)]="fCategory" placeholder="e.g. Hot Drinks" /></div>
              <div class="field"><label>Price</label><input type="number" step="0.01" [(ngModel)]="fPrice" placeholder="0.00" /></div>
              <div class="field"><label>Stock</label><input type="number" [(ngModel)]="fStock" placeholder="0" /></div>
              <div class="field span-2"><label>Description</label><input [(ngModel)]="fDesc" placeholder="Short description" /></div>
              <div class="field check"><label class="chk"><input type="checkbox" [(ngModel)]="fAvail" /> Available</label></div>
            </div>
            <div class="form-actions">
              <button class="btn btn-outline" (click)="closeForm()">Cancel</button>
              <button class="btn btn-primary" (click)="save()">Save changes</button>
            </div>
          </div>
        }

        <div class="table-wrap card">
          <table>
            <thead><tr><th>Item</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th></th></tr></thead>
            <tbody>
              @for (item of items(); track item.id) {
                <tr>
                  <td><div class="cell-name">@if (item.imageUrl) { <img [src]="item.imageUrl" alt="" class="thumb" /> }<span>{{ item.name }}</span></div></td>
                  <td><span class="tag">{{ item.category }}</span></td>
                  <td class="num">R{{ item.price | number:'1.2-2' }}</td>
                  <td><span class="stock" [class.low]="item.stockQuantity < 10" [class.out]="item.stockQuantity < 1">{{ item.stockQuantity }}</span></td>
                  <td><span class="dot" [class.on]="item.isAvailable"></span></td>
                  <td class="actions">
                    <button class="btn btn-sm btn-outline" (click)="edit(item)">Edit</button>
                    <button class="btn btn-sm btn-danger" (click)="remove(item.id)">Delete</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <!-- ───── USERS ───── -->
      @if (tab() === 'users') {
        <div class="admin-header">
          <h2 class="page-title">Users</h2>
          <button class="btn btn-primary" (click)="openUserForm()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New user
          </button>
        </div>

        @if (showUserForm()) {
          <div class="form-panel card">
            <div class="form-header">
              <h3>New user</h3>
              <button class="btn btn-sm btn-outline" (click)="closeUserForm()">✕</button>
            </div>
            <div class="form-grid">
              <div class="field"><label>Username</label><input [(ngModel)]="uName" placeholder="e.g. cashier1" /></div>
              <div class="field"><label>Password</label><input type="password" [(ngModel)]="uPass" placeholder="Min 6 chars" /></div>
              <div class="field"><label>Display name</label><input [(ngModel)]="uDisplay" placeholder="e.g. Jane" /></div>
              <div class="field"><label>Role</label><select [(ngModel)]="uRole" class="sel"><option value="cashier">Cashier</option><option value="admin">Admin</option></select></div>
            </div>
            <div class="form-actions">
              <button class="btn btn-outline" (click)="closeUserForm()">Cancel</button>
              <button class="btn btn-primary" (click)="saveUser()">Create user</button>
            </div>
          </div>
        }

        <div class="table-wrap card">
          <table>
            <thead><tr><th>Username</th><th>Display name</th><th>Role</th><th></th></tr></thead>
            <tbody>
              @for (u of users(); track u.id) {
                <tr>
                  <td><strong>{{ u.username }}</strong></td>
                  <td>{{ u.displayName }}</td>
                  <td><span class="tag">{{ u.role }}</span></td>
                  <td class="actions">
                    <button class="btn btn-sm btn-danger" (click)="removeUser(u.id)">Delete</button>
                  </td>
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

    .tabs { display: flex; gap: 0; margin-bottom: 1.5rem; border-bottom: 2px solid var(--border); }
    .tab { padding: 0.6rem 1.25rem; border: 0; background: transparent; font-size: 0.8125rem; font-weight: 700; color: var(--muted); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all 0.15s; font-family: inherit; }
    .tab:hover { color: var(--text-2); }
    .tab.active { color: var(--accent-2); border-color: var(--accent-2); }

    .admin-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; }
    .admin-header .page-title { margin: 0; }

    .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.75rem; margin-bottom: 1.5rem; }
    .metric { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem; }
    .m-value { font-size: 1.25rem; font-weight: 800; color: var(--accent-2); letter-spacing: -0.02em; }
    .m-label { font-size: 0.6875rem; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; margin-top: 0.125rem; }

    .form-panel { padding: 1.25rem; margin-bottom: 1.25rem; }
    .form-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    .form-header h3 { margin: 0; font-size: 0.9375rem; font-weight: 700; }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
    .field { display: flex; flex-direction: column; gap: 0.25rem; }
    .field.span-2 { grid-column: 1 / -1; }
    .field.check { justify-content: flex-end; }
    .field label { font-size: 0.6875rem; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .chk { display: flex; align-items: center; gap: 0.375rem; font-size: 0.8125rem; cursor: pointer; user-select: none; }
    .form-actions { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1rem; }
    .sel { padding: 0.5rem 0.75rem; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 0.8125rem; font-family: inherit; background: var(--surface); color: var(--text); outline: none; }

    .table-wrap { overflow: hidden; }
    table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
    th { padding: 0.625rem 1rem; text-align: left; font-size: 0.6875rem; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; background: var(--surface-2); border-bottom: 1px solid var(--border); }
    td { padding: 0.625rem 1rem; border-bottom: 1px solid var(--border); vertical-align: middle; }
    tr:last-child td { border: 0; }
    .cell-name { display: flex; align-items: center; gap: 0.625rem; font-weight: 600; }
    .thumb { width: 32px; height: 32px; border-radius: 6px; object-fit: cover; flex-shrink: 0; background: #f0e8de; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .tag { display: inline-block; background: var(--accent-light); color: var(--accent-2); font-size: 0.6875rem; font-weight: 600; padding: 0.125rem 0.5rem; border-radius: 100px; }
    .stock { font-weight: 700; font-variant-numeric: tabular-nums; }
    .stock.low { color: var(--accent); }
    .stock.out { color: var(--red); }
    .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
    .dot.on { background: var(--green); }
    .actions { display: flex; gap: 0.375rem; justify-content: flex-end; }
  `]
})
export class AdminComponent implements OnInit {
  private service = inject(MenuItemService);
  readonly tab = signal<'inventory' | 'users'>('inventory');

  // ── Inventory state ──────────────────────────
  readonly items = signal<MenuItem[]>([]);
  readonly summary = signal<any>(null);
  readonly showForm = signal(false);
  readonly editing = signal<MenuItem | null>(null);
  fName = ''; fCategory = ''; fPrice: number | null = null; fStock: number | null = null; fDesc = ''; fAvail = true;

  // ── Users state ──────────────────────────────
  readonly users = signal<any[]>([]);
  readonly showUserForm = signal(false);
  uName = ''; uPass = ''; uDisplay = ''; uRole: 'cashier' | 'admin' = 'cashier';

  ngOnInit() { this.loadInv(); this.loadSum(); this.loadUsers(); }

  // ── Inventory ────────────────────────────────
  private loadInv() { this.service.getItems().subscribe(items => this.items.set(items)); }
  private loadSum() { this.service.getSummary().subscribe(s => this.summary.set(s)); }

  openNew() { this.resetInv(); this.showForm.set(true); }
  edit(item: MenuItem) {
    this.editing.set(item); this.fName = item.name; this.fCategory = item.category;
    this.fPrice = item.price; this.fStock = item.stockQuantity; this.fDesc = item.description ?? ''; this.fAvail = item.isAvailable;
    this.showForm.set(true);
  }
  closeForm() { this.showForm.set(false); this.editing.set(null); }
  save() {
    this.service.writeItem({ id: this.editing()?.id ?? 0, name: this.fName, category: this.fCategory, price: this.fPrice ?? 0, stockQuantity: this.fStock ?? 0, description: this.fDesc || null, isAvailable: this.fAvail })
      .subscribe({ next: () => { this.loadInv(); this.closeForm(); }, error: () => alert('Save failed') });
  }
  remove(id: number) { if (confirm('Delete this item?')) this.service.deleteItem(id).subscribe({ next: () => this.loadInv() }); }
  private resetInv() { this.fName = ''; this.fCategory = ''; this.fPrice = null; this.fStock = null; this.fDesc = ''; this.fAvail = true; }

  // ── Users ────────────────────────────────────
  private loadUsers() { this.service.getUsers().subscribe(users => this.users.set(users)); }

  openUserForm() { this.resetUser(); this.showUserForm.set(true); }
  closeUserForm() { this.showUserForm.set(false); }
  saveUser() {
    this.service.createUser({ username: this.uName, password: this.uPass, displayName: this.uDisplay, role: this.uRole })
      .subscribe({ next: () => { this.loadUsers(); this.closeUserForm(); }, error: (e) => alert(e.error?.error || 'Save failed') });
  }
  removeUser(id: number) { if (confirm('Delete this user?')) this.service.deleteUser(id).subscribe({ next: () => this.loadUsers() }); }
  private resetUser() { this.uName = ''; this.uPass = ''; this.uDisplay = ''; this.uRole = 'cashier'; }
}
