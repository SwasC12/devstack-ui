import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MenuItemService } from '../../menu-item.service';
import { BtnComponent } from '../../btn.component';
import { PasswordInputComponent } from '../../password-input.component';
import { AuthService } from '../../auth.service';
import { DialogService } from '../../dialog.service';
import { SoundService } from '../../sound.service';

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
  private sound = inject(SoundService);
  auth = inject(AuthService);

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

  // Platform dashboard (right rail): overview counters + live activity feed
  readonly overview = signal<any | null>(null);
  // Platform health (API/DB/push/storage dots)
  readonly health = signal<any | null>(null);
  // Which shop row has its ⋮ menu open (null = none). The menu itself is a
  // single FIXED-position dropdown so the table's overflow clipping can't
  // cut it off.
  readonly menuFor = signal<number | null>(null);
  readonly menuPos = signal<{ x: number; y: number } | null>(null);
  // Shop search: name / code / owner email / owner phone
  search = '';

  // Tabs: shops dashboard | app releases
  readonly tab = signal<'shops' | 'releases'>('shops');

  // App releases (superadmin publish/rollback)
  readonly releases = signal<any[]>([]);
  rVersion = ''; rNotes = ''; rRequired = false; rApk: File | null = null;
  readonly rBusy = signal(false);

  ngOnInit() { this.load(); this.loadOverview(); this.loadHealth(); this.loadReleases(); }

  private load() { this.service.getShops().subscribe(s => this.shops.set(s)); }

  private loadOverview() { this.service.getPlatformOverview().subscribe(o => this.overview.set(o)); }

  private loadHealth() { this.service.getPlatformHealth().subscribe(h => this.health.set(h)); }

  private loadReleases() { this.service.getReleases().subscribe(r => this.releases.set(r)); }

  // ── App releases ────────────────────────────────────

  onApkFile(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    this.rApk = f ?? null;
  }

  publishRelease() {
    if (!this.rVersion.trim() || !this.rApk) { this.dialog.toast('Version and APK file are required', 'error'); return; }
    const fd = new FormData();
    fd.append('version', this.rVersion.trim());
    fd.append('releaseNotes', this.rNotes.trim());
    fd.append('isRequired', String(this.rRequired));
    fd.append('file', this.rApk);
    this.rBusy.set(true);
    this.service.publishRelease(fd).subscribe({
      next: () => {
        this.rBusy.set(false);
        this.loadReleases();
        this.loadOverview();
        this.rVersion = ''; this.rNotes = ''; this.rRequired = false; this.rApk = null;
        this.dialog.toast('Release published — shops notified', 'success');
      },
      error: (e) => { this.rBusy.set(false); this.dialog.toast(e.error?.error || 'Publish failed', 'error'); }
    });
  }

  deleteRelease(r: any) {
    this.dialog.confirm('Delete release', `Delete v${r.version}?${r.isCurrent ? ' The newest remaining release becomes current again.' : ''}`).then(ok => {
      if (!ok) return;
      this.service.deleteRelease(r.id).subscribe({
        next: () => { this.loadReleases(); this.loadOverview(); },
        error: (e) => this.dialog.toast(e.error?.error || 'Delete failed', 'error')
      });
    });
  }

  readonly filteredShops = () => {
    const q = this.search.trim().toLowerCase();
    if (!q) return this.shops();
    return this.shops().filter(s =>
      (s.name ?? '').toLowerCase().includes(q) ||
      (s.code ?? '').toLowerCase().includes(q) ||
      (s.ownerEmail ?? '').toLowerCase().includes(q) ||
      (s.ownerPhone ?? '').toLowerCase().includes(q)
    );
  };

  // Welcome banner
  greeting(): string {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  }

  // Dismissible for the day (fresh numbers each morning, no clutter mid-day).
  readonly welcomeHidden = signal(this.welcomeDismissedForToday());

  private welcomeDismissedForToday(): boolean {
    return localStorage.getItem('platform_welcome_hidden') === new Date().toISOString().slice(0, 10);
  }

  dismissWelcome() {
    localStorage.setItem('platform_welcome_hidden', new Date().toISOString().slice(0, 10));
    this.welcomeHidden.set(true);
  }

  welcomeIssues(): string | null {
    const s = this.overview()?.stats;
    if (!s) return null;
    const parts: string[] = [];
    if (s.suspendedShops > 0) parts.push(`${s.suspendedShops} shop${s.suspendedShops === 1 ? '' : 's'} suspended`);
    if (s.pushFailures30d > 0) parts.push(`${s.pushFailures30d} push failure${s.pushFailures30d === 1 ? '' : 's'}`);
    return parts.length ? parts.join(' · ') : null;
  }

  // ⋮ row menu
  toggleMenu(id: number, e: Event) {
    e.stopPropagation();
    if (this.menuFor() === id) { this.closeMenu(); return; }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    this.menuPos.set({ x: r.right, y: r.bottom + 6 });
    this.menuFor.set(id);
  }
  closeMenu() { this.menuFor.set(null); this.menuPos.set(null); }
  shopById(id: number): any { return this.shops().find(s => s.id === id) ?? null; }

  eventIcon(t: string): string {
    switch (t) {
      case 'shop_created': return '🏪';
      case 'shop_activated': return '✅';
      case 'shop_suspended': return '⏸️';
      case 'password_reset': return '🔑';
      case 'broadcast_sent': return '📣';
      case 'push_failed': return '⚠️';
      default: return '•';
    }
  }

  focusComposer() { document.querySelector('.announce')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

  openForm() { this.showForm.set(true); }
  closeForm() { this.showForm.set(false); }

  save() {
    this.service.createShop({ name: this.fName, code: this.fCode, adminUsername: this.fAdminUser, adminPassword: this.fAdminPass, adminDisplayName: this.fAdminDisplay }).subscribe({
      next: () => { this.load(); this.loadOverview(); this.closeForm(); this.reset(); },
      error: (e) => this.dialog.toast(e.error?.error || 'Save failed', 'error')
    });
  }

  private reset() { this.fName = ''; this.fCode = ''; this.fAdminUser = ''; this.fAdminPass = ''; this.fAdminDisplay = ''; }

  // ── Owner contact ────────────────────────────────────

  // One-off email to a shop owner: opens YOUR mail client (e.g. Gmail,
  // swasteerc@gmail.com) pre-filled with a template - no email service,
  // no bulk sending, nothing leaves the machine except the draft you send.
  emailOwner(s: any) {
    if (!s.ownerEmail) { this.dialog.toast('No owner email on file', 'info'); return; }
    const subject = `CoffeeShop Pro — ${s.name}`;
    const body = [
      'Hi there,',
      '',
      '[Write your message here]',
      '',
      '—',
      'Swas · CoffeeShop Pro',
      'https://devstack-one.vercel.app'
    ].join('\n');
    const url = `mailto:${s.ownerEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    // Anchor click with _system: opens the device mail app (Gmail) from the
    // Capacitor WebView AND from the browser. window.location.href alone gets
    // swallowed by the WebView navigation handler.
    const a = document.createElement('a');
    a.href = url;
    a.target = '_system';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

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
        this.sound.sent();
        this.loadOverview();
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
        next: () => { this.busyId.set(null); this.load(); this.loadOverview(); this.dialog.toast(action === 'suspend' ? 'Shop suspended' : 'Shop activated', 'success'); },
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
          this.loadOverview();
          this.dialog.reveal('New password', `For ${res.username} (${res.displayName}) at ${s.name}. Relay it to the owner — this is the only time it's shown.`, res.password);
        },
        error: (e) => { this.busyId.set(null); this.dialog.toast(e.error?.error || 'Failed', 'error'); }
      });
    });
  }
}
