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

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, BtnComponent, PasswordInputComponent],
  template: `
    <div class="admin">
      <!-- Tabs -->
      <div class="tabs">
        <button class="tab" [class.active]="tab() === 'inventory'" (click)="tab.set('inventory')">Inventory</button>
        <button class="tab" [class.active]="tab() === 'categories'" (click)="tab.set('categories')">Categories</button>
        <button class="tab" [class.active]="tab() === 'users'" (click)="tab.set('users')">Users</button>
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
        <div class="table-card">
          <table>
            <thead>
              <tr><th>Item</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              @for (item of items(); track item.id) {
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
    .field { display: flex; flex-direction: column; gap: 0.3em; }
    .field.wide { grid-column: 1 / -1; }
    .field.chk { justify-content: flex-end; }
    .field label { font-size: 0.68rem; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .field input:not([type]) { padding: 0.6em 0.8em; border: 0.125em solid var(--border-hover); border-radius: 0.75em; font-size: 0.85rem; font-family: inherit; color: var(--text); background: var(--surface-2); outline: none; transition: border-color 0.15s; }
    .field input:focus { border-color: var(--accent); }
    .img-upload { display: flex; align-items: center; gap: 0.6em; flex-wrap: wrap; }
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
  `]
})
export class AdminComponent implements OnInit {
  private service = inject(MenuItemService);
  private auth = inject(AuthService);
  private dialog = inject(DialogService);
  readonly tab = signal<'inventory' | 'categories' | 'users' | 'settings'>('inventory');

  // Inventory
  readonly items = signal<MenuItem[]>([]);
  readonly summary = signal<any>(null);
  readonly showForm = signal(false);
  readonly editing = signal<MenuItem | null>(null);
  fName = ''; fCategory = ''; fPrice: number | null = null; fStock: number | null = null; fDesc = ''; fAvail = true;
  fImageUrl = ''; fImagePublicId = ''; readonly uploading = signal(false);

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
  brName = ''; brLogoUrl = '';
  readonly brMsg = signal(''); readonly brErr = signal(false); readonly brBusy = signal(false);
  readonly logoUploading = signal(false);

  ngOnInit() { this.loadInv(); this.loadSum(); this.loadUsers(); this.loadCategories(); this.loadSettings(); }

  private loadInv() { this.service.getItems().subscribe(items => this.items.set(items)); }
  private loadSum() { this.service.getSummary().subscribe(s => this.summary.set(s)); }
  private loadUsers() { this.service.getUsers().subscribe(users => this.users.set(users)); }

  openNew() { this.resetInv(); this.showForm.set(true); }
  edit(item: MenuItem) { this.editing.set(item); this.fName = item.name; this.fCategory = item.category; this.fPrice = item.price; this.fStock = item.stockQuantity; this.fDesc = item.description ?? ''; this.fAvail = item.isAvailable; this.fImageUrl = item.imageUrl ?? ''; this.fImagePublicId = item.imagePublicId ?? ''; this.showForm.set(true); }
  closeForm() { this.showForm.set(false); this.editing.set(null); }
  save() {
    if (!this.fCategory.trim()) { this.dialog.toast('Choose a category', 'error'); return; }
    this.service.writeItem({ id: this.editing()?.id ?? 0, name: this.fName, category: this.fCategory, price: this.fPrice ?? 0, stockQuantity: this.fStock ?? 0, description: this.fDesc || null, imageUrl: this.fImageUrl || null, imagePublicId: this.fImagePublicId || null, isAvailable: this.fAvail }).subscribe({ next: () => { this.loadInv(); this.closeForm(); }, error: () => this.dialog.toast('Save failed', 'error') });
  }
  remove(id: number) {
    this.dialog.confirm('Delete item', 'Delete this item?').then(ok => {
      if (ok) this.service.deleteItem(id).subscribe({ next: () => this.loadInv(), error: () => this.dialog.toast('Delete failed', 'error') });
    });
  }
  private resetInv() { this.fName = ''; this.fCategory = ''; this.fPrice = null; this.fStock = null; this.fDesc = ''; this.fAvail = true; this.fImageUrl = ''; this.fImagePublicId = ''; }

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
    this.service.updateShopInfo({ name: this.brName, logoUrl: this.brLogoUrl || null }).subscribe({
      next: () => { this.brMsg.set('Branding saved.'); this.brBusy.set(false); },
      error: (e) => { this.brMsg.set(e.error?.error || 'Failed'); this.brErr.set(true); this.brBusy.set(false); }
    });
  }
}
