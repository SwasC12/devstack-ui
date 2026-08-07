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
  templateUrl: './shops.component.html',
  styleUrl: './shops.component.scss',
})
export class ShopsComponent implements OnInit {
  private service = inject(MenuItemService);
  private dialog = inject(DialogService);

  readonly shops = signal<any[]>([]);
  readonly showForm = signal(false);
  readonly busyId = signal<number | null>(null);
  fName = ''; fCode = ''; fAdminUser = ''; fAdminPass = ''; fAdminDisplay = '';

  // Owner contact editor (superadmin; feeds future owner emails)
  ownerEdit: any | null = null;
  fOwnerEmail = ''; fOwnerPhone = '';
  readonly ownerBusy = signal(false);

  // Announcement composer (superadmin -> owners)
  bcTitle = ''; bcBody = ''; bcShopId: number | null = null;
  readonly bcBusy = signal(false);

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

  // ── Owner contact ────────────────────────────────────

  openOwnerEdit(s: any) { this.ownerEdit = s; this.fOwnerEmail = s.ownerEmail ?? ''; this.fOwnerPhone = s.ownerPhone ?? ''; }
  closeOwnerEdit() { this.ownerEdit = null; }

  saveOwner() {
    if (!this.ownerEdit) return;
    this.ownerBusy.set(true);
    this.service.updateShopOwner(this.ownerEdit.id, this.fOwnerEmail.trim() || null, this.fOwnerPhone.trim() || null).subscribe({
      next: () => { this.ownerBusy.set(false); this.load(); this.closeOwnerEdit(); this.dialog.toast('Owner contact saved', 'success'); },
      error: (e) => { this.ownerBusy.set(false); this.dialog.toast(e.error?.error || 'Save failed', 'error'); }
    });
  }

  // ── Announcement broadcast ─────────────────────────────

  broadcast() {
    if (!this.bcTitle.trim() || !this.bcBody.trim()) { this.dialog.toast('Add a title and message', 'error'); return; }
    this.bcBusy.set(true);
    this.service.broadcastNotification(this.bcTitle.trim(), this.bcBody.trim(), this.bcShopId).subscribe({
      next: (res) => {
        this.bcBusy.set(false);
        this.dialog.toast(`Sent to ${res.delivered} owner${res.delivered === 1 ? '' : 's'} (${res.pushed} device${res.pushed === 1 ? '' : 's'})`, 'success');
        this.bcTitle = ''; this.bcBody = '';
      },
      error: (e) => { this.bcBusy.set(false); this.dialog.toast(e.error?.error || 'Send failed', 'error'); }
    });
  }

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
