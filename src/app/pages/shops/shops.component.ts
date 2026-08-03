import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MenuItemService } from '../../menu-item.service';
import { BtnComponent } from '../../btn.component';
import { PasswordInputComponent } from '../../password-input.component';
import { DialogService } from '../../dialog.service';

@Component({
  selector: 'app-shops',
  standalone: true,
  imports: [CommonModule, FormsModule, BtnComponent, PasswordInputComponent],
  template: `
    <div class="shops">
      <div class="section-head">
        <h2 class="page-title">Shops</h2>
        <app-btn variant="primary" (onClick)="openForm()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New shop
        </app-btn>
      </div>

      @if (showForm()) {
        <div class="form-sheet">
          <div class="form-head">
            <h3>New shop</h3>
            <app-btn size="sm" (onClick)="closeForm()">✕</app-btn>
          </div>
          <div class="form-grid">
            <div class="field"><label>Shop name</label><input [(ngModel)]="fName" placeholder="e.g. Rosebank Coffee" /></div>
            <div class="field"><label>Shop code</label><input [(ngModel)]="fCode" placeholder="e.g. ROSEBANK" (keyup)="fCode = fCode.toUpperCase()" /></div>
            <div class="field"><label>First admin username</label><input [(ngModel)]="fAdminUser" placeholder="e.g. owner" /></div>
            <div class="field"><label>First admin password</label><app-password [(ngModel)]="fAdminPass" placeholder="Min 10 · upper + lower + digit" autocomplete="new-password" /></div>
            <div class="field"><label>Admin display name</label><input [(ngModel)]="fAdminDisplay" placeholder="e.g. Jane" /></div>
          </div>
          <div class="form-acts">
            <app-btn size="sm" (onClick)="closeForm()">Cancel</app-btn>
            <app-btn variant="primary" size="sm" (onClick)="save()">Create shop</app-btn>
          </div>
        </div>
      }

      <div class="table-card">
        <table>
          <thead><tr><th>Name</th><th>Code</th><th>Status</th><th>Users</th><th>Orders</th><th>Last order</th><th>Created</th><th></th></tr></thead>
          <tbody>
            @for (s of shops(); track s.id) {
              <tr [class.row-suspended]="!s.isActive">
                <td><strong>{{ s.name }}</strong></td>
                <td><span class="pill">{{ s.code }}</span></td>
                <td><span class="status" [class.on]="s.isActive">{{ s.isActive ? 'Active' : 'Suspended' }}</span></td>
                <td>{{ s.userCount }}</td>
                <td>{{ s.orderCount }}</td>
                <td class="muted">{{ s.lastOrderAt ? (s.lastOrderAt | date:'short') : '—' }}</td>
                <td class="muted">{{ s.createdAt | date:'mediumDate' }}</td>
                <td class="cell-acts">
                  <app-btn size="sm" [variant]="s.isActive ? 'danger' : 'primary'" (onClick)="toggleStatus(s)" [loading]="busyId() === s.id">
                    {{ s.isActive ? 'Suspend' : 'Activate' }}
                  </app-btn>
                  <app-btn size="sm" (onClick)="resetPassword(s)">Reset password</app-btn>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="8" style="color:var(--muted);text-align:center;padding:1.5rem;">No shops yet — create one.</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: [`
    .shops { max-width: 720px; }

    .section-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; }
    .section-head .page-title { margin: 0; }

    .form-sheet { background: var(--surface); border: 1px solid var(--accent); border-radius: 1.25em; padding: 1.25em; margin-bottom: 1.25rem; box-shadow: 0 4px 20px rgba(0,0,0,0.25); }
    .form-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1em; }
    .form-head h3 { margin: 0; font-size: 0.9375rem; font-weight: 700; color: var(--accent-2); }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.85em; }
    .field { display: flex; flex-direction: column; gap: 0.3em; }
    .field label { font-size: 0.68rem; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .field input:not([type]) { padding: 0.6em 0.8em; border: 0.125em solid var(--border-hover); border-radius: 0.75em; font-size: 0.85rem; font-family: inherit; color: var(--text); background: var(--surface-2); outline: none; transition: border-color 0.15s; }
    .field input[type="password"] { padding: 0.6em 0.8em; border: 0.125em solid var(--border-hover); border-radius: 0.75em; font-size: 0.85rem; font-family: inherit; color: var(--text); background: var(--surface-2); outline: none; transition: border-color 0.15s; }
    .field input:focus { border-color: var(--accent); }
    .form-acts { display: flex; gap: 0.5em; justify-content: flex-end; margin-top: 1em; }

    .table-card { background: var(--surface); border: 1px solid var(--border); border-radius: 1.25em; overflow: hidden; }
    table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 0.8125rem; }
    th { padding: 0.75em 1em; text-align: left; font-size: 0.68rem; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; background: var(--surface-2); border-bottom: 1px solid var(--border); }
    th:first-child { width: 22%; }
    th:nth-child(2) { width: 10%; }
    th:nth-child(3) { width: 10%; }
    th:nth-child(4) { width: 7%; }
    th:nth-child(5) { width: 8%; }
    th:nth-child(6) { width: 14%; }
    th:nth-child(7) { width: 13%; }
    th:last-child { width: 16%; }
    td { padding: 0.7em 1em; border-bottom: 1px solid var(--border); vertical-align: middle; }
    tr:last-child td { border: 0; }
    .row-suspended td { opacity: 0.55; }
    .status { display: inline-block; font-size: 0.68rem; font-weight: 700; padding: 0.15em 0.6em; border-radius: 100px; background: var(--red-bg); color: var(--red); }
    .status.on { background: var(--green-bg); color: var(--green); }
    .muted { color: var(--muted); }
    .cell-acts { display: flex; gap: 0.4em; justify-content: flex-end; flex-wrap: wrap; }

    .pill { display: inline-block; background: var(--accent-light); color: var(--accent-2); font-size: 0.68rem; font-weight: 600; padding: 0.15em 0.6em; border-radius: 100px; }
  `]
})
export class ShopsComponent implements OnInit {
  private service = inject(MenuItemService);
  private dialog = inject(DialogService);

  readonly shops = signal<any[]>([]);
  readonly showForm = signal(false);
  readonly busyId = signal<number | null>(null);
  fName = ''; fCode = ''; fAdminUser = ''; fAdminPass = ''; fAdminDisplay = '';

  ngOnInit() { this.load(); }

  private load() { this.service.getShops().subscribe(s => this.shops.set(s)); }

  openForm() { this.showForm.set(true); }
  closeForm() { this.showForm.set(false); }

  save() {
    this.service.createShop({ name: this.fName, code: this.fCode, adminUsername: this.fAdminUser, adminPassword: this.fAdminPass, adminDisplayName: this.fAdminDisplay }).subscribe({
      next: () => { this.load(); this.closeForm(); this.reset(); },
      error: (e) => this.dialog.toast(e.error?.error || 'Save failed', 'error')
    });
  }

  private reset() { this.fName = ''; this.fCode = ''; this.fAdminUser = ''; this.fAdminPass = ''; this.fAdminDisplay = ''; }

  // ── Lifecycle actions ─────────────────────────────────

  toggleStatus(s: any) {
    const action = s.isActive ? 'suspend' : 'activate';
    this.dialog.confirm(`${action === 'suspend' ? 'Suspend' : 'Activate'} shop`, `${action === 'suspend' ? 'Suspend' : 'Activate'} "${s.name}"? ${action === 'suspend' ? 'Staff will be signed out and blocked until you reactivate it.' : 'Staff can sign in again.'}`).then(ok => {
      if (!ok) return;
      this.busyId.set(s.id);
      this.service.setShopStatus(s.id, !s.isActive).subscribe({
        next: () => { this.busyId.set(null); this.load(); this.dialog.toast(action === 'suspend' ? 'Shop suspended' : 'Shop activated', 'success'); },
        error: (e) => { this.busyId.set(null); this.dialog.toast(e.error?.error || 'Failed', 'error'); }
      });
    });
  }

  resetPassword(s: any) {
    this.dialog.confirm('Reset admin password', `Generate a new password for "${s.name}" and show it once? The owner's current password stops working immediately.`).then(ok => {
      if (!ok) return;
      this.busyId.set(s.id);
      this.service.resetShopAdminPassword(s.id).subscribe({
        next: (res) => {
          this.busyId.set(null);
          this.dialog.reveal('New password', `For ${res.username} (${res.displayName}) at ${s.name}. Relay it to the owner — this is the only time it's shown.`, res.password);
        },
        error: (e) => { this.busyId.set(null); this.dialog.toast(e.error?.error || 'Failed', 'error'); }
      });
    });
  }
}
