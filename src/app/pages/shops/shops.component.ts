import { Component, inject, signal, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MenuItemService } from '../../menu-item.service';
import { BtnComponent } from '../../btn.component';
import { PasswordInputComponent } from '../../password-input.component';
import { AuthService } from '../../auth.service';
import { DialogService } from '../../dialog.service';
import { SoundService } from '../../sound.service';
import { SortableDirective } from '../../sortable.directive';
import { IconComponent } from '../../icon.component';
import { Capacitor } from '@capacitor/core';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-shops',
  standalone: true,
  imports: [CommonModule, FormsModule, BtnComponent, PasswordInputComponent, SortableDirective, IconComponent],
  templateUrl: './shops.component.html',
  styleUrl: './shops.component.scss',
})
export class ShopsComponent implements OnInit {
  private service = inject(MenuItemService);
  private dialog = inject(DialogService);
  private sound = inject(SoundService);
  private router = inject(Router);
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
  readonly backupMsg = signal('');
  // Superadmin: full JSON snapshot of the platform (shops, menu, orders...).
  async downloadBackup(): Promise<void> {
    const token = this.auth.token;
    if (!token) { this.backupMsg.set('Not signed in'); return; }
    try {
      const res = await fetch(`${environment.apiBase}/admin/export`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { this.backupMsg.set(`Backup failed (HTTP ${res.status})`); return; }
      const text = await res.text();
      const name = `backup-${new Date().toISOString().slice(0, 10)}.json`;
      if (Capacitor.isNativePlatform()) {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        await Filesystem.writeFile({ path: name, data: text, directory: Directory.Documents });
        this.backupMsg.set(`Saved to Documents/${name}`);
      } else {
        const blob = new Blob([text], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        URL.revokeObjectURL(a.href);
        this.backupMsg.set('Backup downloaded');
      }
    } catch { this.backupMsg.set('Backup failed'); }
  }
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

  ngOnInit() { this.load(); this.loadOverview(); this.loadHealth(); this.loadReleases(); this.loadRevenue(); }

  private load() {
    this.service.getShopsMeta().subscribe(r => {
      this.currentVersion.set(r.currentVersion);
      this.shops.set(r.shops);
    });
  }

  // ── Current published version (for the "old version" at-risk flag) ────────
  readonly currentVersion = signal<string | null>(null);

  // ── At-risk detection ─────────────────────────────────────────────────────
  // Returns the risk flags for a shop: suspended, idle (no orders in 14 days
  // despite having some history), and running an app version older than the
  // current release. Empty array = healthy.
  private static readonly IDLE_DAYS = 14;
  shopRisks(s: any): string[] {
    const risks: string[] = [];
    if (!s.isActive) risks.push('Suspended');
    const cur = this.currentVersion();
    if (cur && s.appVersion && s.appVersion !== cur) risks.push('Old app');
    if (s.orderCount > 0 && s.lastOrderAt) {
      const days = (Date.now() - new Date(s.lastOrderAt).getTime()) / 86400000;
      if (days > ShopsComponent.IDLE_DAYS) risks.push(`Idle ${Math.floor(days)}d`);
    }
    return risks;
  }
  // Shops with any risk flag, for the "Needs attention" dashboard card.
  atRiskShops(): { shop: any; risks: string[] }[] {
    return this.shops()
      .map(s => ({ shop: s, risks: this.shopRisks(s) }))
      .filter(x => x.risks.length > 0);
  }

  // ── Per-shop detail drawer ────────────────────────────────────────────────
  readonly drawerShop = signal<any | null>(null);
  readonly drawerDetail = signal<any | null>(null);
  readonly drawerBusy = signal(false);
  openDetail(s: any) {
    this.drawerShop.set(s);
    this.drawerDetail.set(null);
    this.drawerBusy.set(true);
    this.service.getShopDetail(s.id).subscribe({
      next: d => { this.drawerDetail.set(d); this.drawerBusy.set(false); },
      error: () => { this.drawerBusy.set(false); this.dialog.toast('Could not load shop detail', 'error'); },
    });
  }
  closeDrawer() { this.drawerShop.set(null); this.drawerDetail.set(null); }

  // ── Platform revenue trend ────────────────────────────────────────────────
  readonly revSeries = signal<any | null>(null);
  readonly revDays = signal(30);
  loadRevenue(days = this.revDays()) {
    this.revDays.set(days);
    this.service.getRevenueSeries(days).subscribe({
      next: r => this.revSeries.set(r),
      error: () => { /* leave the previous series */ },
    });
  }
  // Bar height % for a day's revenue against the series max (min 2% so a
  // non-zero day is always visible).
  revBarPct(revenue: number): number {
    const series = this.revSeries()?.series ?? [];
    const max = Math.max(...series.map((d: any) => Number(d.revenue)), 1);
    return revenue > 0 ? Math.max(2, (Number(revenue) / max) * 100) : 0;
  }

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
    const ev = this.overview()?.events ?? [];
    if (!ev.length) return null;
    const today = new Date();
    const isToday = (iso: string) => { const d = new Date(iso); return d.toDateString() === today.toDateString(); };
    const todays = ev.filter((e: any) => isToday(e.createdAtUtc));
    const parts: string[] = [];
    const pushFails = todays.filter((e: any) => e.type === 'push_failed').length;
    if (pushFails > 0) parts.push(`${pushFails} push failure${pushFails === 1 ? '' : 's'} today`);
    const suspended = todays.filter((e: any) => e.type === 'shop_suspended').length;
    if (suspended > 0) parts.push(`${suspended} shop${suspended === 1 ? '' : 's'} suspended today`);
    return parts.length ? parts.join(' · ') : null;
  }

  // Collapsible rail cards (Live Activity grows large; the announce composer
  // pushes the New shop form down).
  readonly liveOpen = signal(false);
  toggleLive() { this.liveOpen.update(v => !v); }
  readonly announceOpen = signal(false);
  toggleAnnounce() { this.announceOpen.update(v => !v); }

  // Overview cells explain themselves when tapped - a popup beats a mystery number.
  explainMetric(key: string) {
    const s = this.overview()?.stats;
    const u = this.overview()?.update;
    const n = s?.[key] ?? (u?.[key] ?? 0);
    const map: Record<string, [string, string]> = {
      activeShops: ['Active shops', 'Shops currently active on the platform. Suspended shops are excluded. A shop can be suspended/reactivated from the ⋮ menu on its row.'],
      suspendedShops: ['Suspended shops', 'Shops suspended by the platform owner. Suspended shops cannot log in until reactivated - existing sessions die within the access-token lifetime.'],
      ordersToday: ['Orders today', 'Orders placed across ALL shops today (SAST), excluding voided ones.'],
      notificationsSent30d: ['Notifications 30d', 'In-app notifications + FCM pushes sent to shop admins in the last 30 days (broadcasts, low-stock alerts).'],
      passwordResets30d: ['Password resets 30d', 'Admin password resets performed in the last 30 days (via the ⋮ menu on a shop row).'],
      pushFailures30d: ['Push failures 30d', 'Device pushes that failed in the last 30 days - usually a dead/old push token after an app reinstall. The device token is dropped automatically after a failure.'],
      currentVersion: ['Current version', 'The app version published as the latest release on the App Releases tab.'],
      shopsCheckedIn: ['Shops checked in', 'Shops whose POS has phoned home at least once (reports the version it runs).'],
      shopsUpdated: ['Shops updated', 'Shops currently running the latest published version.'],
      shopsOnOldVersion: ['Shops on old version', 'Shops running an older build - they will see the update banner at the next sign-in.'],
    };
    const hit = map[key];
    if (hit) void this.dialog.alert(hit[0], `${hit[1]}\n\nValue: ${n}`);
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

  // Icon name (for <app-icon>) per platform-event type.
  eventIcon(t: string): string {
    switch (t) {
      case 'shop_created': return 'store';
      case 'shop_activated': return 'check';
      case 'shop_suspended': return 'warning';
      case 'password_reset': return 'key';
      case 'broadcast_sent': return 'megaphone';
      case 'push_failed': return 'warning';
      default: return 'chevron-right';
    }
  }

  focusComposer() { document.querySelector('.announce')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

  openForm() { this.showForm.set(true); }
  closeForm() { this.showForm.set(false); }

  save() {
    this.service.createShop({ name: this.fName, code: this.fCode, adminUsername: this.fAdminUser, adminPassword: this.fAdminPass, adminDisplayName: this.fAdminDisplay, ownerEmail: this.fOwnerEmail.trim() || null }).subscribe({
      next: () => { this.load(); this.loadOverview(); this.closeForm(); this.reset(); },
      error: (e) => this.dialog.toast(e.error?.error || 'Save failed', 'error')
    });
  }

  private reset() { this.fName = ''; this.fCode = ''; this.fAdminUser = ''; this.fAdminPass = ''; this.fAdminDisplay = ''; this.fOwnerEmail = ''; }

  // ── Owner contact ────────────────────────────────────

  // Ready-made email templates (plain text - mailto can't carry HTML).
  // Each builds a subject + body personalised with the shop's details.
  readonly emailTemplates: { key: string; label: string; desc: string; subject: (s: any) => string; body: (s: any) => string }[] = [
    {
      key: 'welcome', label: 'Welcome / onboarding', desc: 'New shop: logins, install, printer',
      subject: (s) => `Welcome to CoffeeShop Pro — ${s.name} ☕`,
      body: (s) => [
        `Hi ${s.name} team,`,
        '',
        'Welcome to CoffeeShop Pro! 🎉 Your shop is live and ready to go.',
        '',
        'Here\'s your quick start:',
        `🔑 Sign in — shop code ${s.code}, using the admin username we created for you.`,
        '📱 Get the app — I\'ll send you the install link/APK.',
        '🖨 Receipt printer — connect it via Android print and you\'re set.',
        '',
        'Need a hand with the menu, staff PINs or anything else? Just reply to this email.',
        '',
        '—',
        'Swas · CoffeeShop Pro',
        'https://devstack-one.vercel.app'
      ].join('\n')
    },
    {
      key: 'update', label: 'Update available', desc: 'New version released — install now',
      subject: (s) => `CoffeeShop Pro update available — ${s.name}`,
      body: (s) => [
        `Hi ${s.name} team,`,
        '',
        'A new version of CoffeeShop Pro is available. 📦',
        '',
        'At sign-in you\'ll see an update banner — it downloads automatically, then tap "Install now" when it\'s ready. Takes about a minute.',
        '',
        'If anything looks off after updating, reply and I\'ll sort it out.',
        '',
        '—',
        'Swas · CoffeeShop Pro',
        'https://devstack-one.vercel.app'
      ].join('\n')
    },
    {
      key: 'maintenance', label: 'Maintenance notice', desc: 'Planned downtime — heads up',
      subject: (s) => `Planned maintenance — ${s.name}`,
      body: (s) => [
        `Hi ${s.name} team,`,
        '',
        'Heads up: we\'re doing planned maintenance on CoffeeShop Pro. 🔧',
        '',
        '⏰ When: [date/time]',
        '⏳ Expected downtime: [~X minutes]',
        '',
        'During that window the till may not be able to place orders. If you\'re open then, let me know and I\'ll reschedule.',
        '',
        '—',
        'Swas · CoffeeShop Pro',
        'https://devstack-one.vercel.app'
      ].join('\n')
    },
    {
      key: 'suspended', label: 'Action needed', desc: 'Shop suspended / account issue',
      subject: (s) => `Action needed — ${s.name}`,
      body: (s) => [
        `Hi ${s.name} team,`,
        '',
        'Your shop has been suspended, so staff can\'t sign in for now. ⚠️',
        '',
        '[What\'s needed to get you back online — e.g. payment, review, etc.]',
        '',
        'Reply to this email and we\'ll get you sorted as fast as possible.',
        '',
        '—',
        'Swas · CoffeeShop Pro',
        'https://devstack-one.vercel.app'
      ].join('\n')
    },
    {
      key: 'tip', label: 'Feature tip', desc: 'A handy feature you might have missed',
      subject: (s) => `A handy CoffeeShop Pro tip — ${s.name}`,
      body: (s) => [
        `Hi ${s.name} team,`,
        '',
        'Quick tip: use the cash-up screen when you close a shift. 💡',
        '',
        'Enter the float you started with at clock-in, count the till when you close, and the app tells you if it\'s short, over or balanced — no more guessing at end of day.',
        '',
        'Want more tips? Reply and I\'ll send a few.',
        '',
        '—',
        'Swas · CoffeeShop Pro',
        'https://devstack-one.vercel.app'
      ].join('\n')
    }
  ];

  // Template picker state (opens as a second panel at the ⋮ menu position)
  readonly emailPickerFor = signal<number | null>(null);
  openEmailPicker(s: any) { this.emailPickerFor.set(s.id); }
  closeEmailPicker() { this.emailPickerFor.set(null); }

  // Send a template to one owner: try the server (real SMTP email) first;
  // if SMTP isn't configured (503) or the shop has no owner email (400),
  // fall back to opening a pre-filled mailto draft in the platform owner's
  // own mail client.
  sendEmailTemplate(s: any, t: { subject: (s: any) => string; body: (s: any) => string }) {
    if (!s.ownerEmail) { this.dialog.toast('No owner email on file', 'info'); return; }
    this.service.emailOwner(s.id, t.subject(s), t.body(s)).subscribe({
      next: (r) => this.dialog.toast(`Email sent to ${r.sentTo}`, 'success'),
      error: (e) => {
        if (e?.status === 503 || e?.status === 400) {
          // SMTP not configured / no address: open the mailto draft instead.
          const url = `mailto:${s.ownerEmail}?subject=${encodeURIComponent(t.subject(s))}&body=${encodeURIComponent(t.body(s))}`;
          const a = document.createElement('a');
          a.href = url;
          a.target = '_system';
          document.body.appendChild(a);
          a.click();
          a.remove();
          this.dialog.toast('Server email unavailable - opened a draft in your mail app', 'info');
        } else {
          this.dialog.toast(e.error?.error || 'Email failed', 'error');
        }
      }
    });
  }

  // Same announcement to every shop with an owner email on file.
  emailAllOwners() {
    this.dialog.prompt('Email all owners', 'Subject').then(subject => {
      if (!subject?.trim()) return;
      this.dialog.prompt('Email all owners', 'Message body').then(body => {
        if (!body?.trim()) return;
        this.dialog.toast('Sending…', 'info');
        this.service.emailBroadcast(subject.trim(), body.trim()).subscribe({
          next: (r) => this.dialog.toast(`Sent to ${r.sent} owner${r.sent === 1 ? '' : 's'}${r.failed > 0 ? ` (${r.failed} failed)` : ''}`, r.failed > 0 ? 'error' : 'success'),
          error: (e) => {
            if (e?.status === 503) this.dialog.toast('Server email is not configured - add SMTP settings to the API', 'error');
            else this.dialog.toast(e.error?.error || 'Broadcast failed', 'error');
          }
        });
      });
    });
  }

  // One-off email to a shop owner: opens YOUR mail client (e.g. Gmail,
  // swasteerc@gmail.com) pre-filled with a template - no email service,
  // no bulk sending, nothing leaves the machine except the draft you send.
  emailOwner(s: any) {
    if (!s.ownerEmail) { this.dialog.toast('No owner email on file', 'info'); return; }
    this.openEmailPicker(s);
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
        const owners = `${res.delivered} owner${res.delivered === 1 ? '' : 's'}`;
        if (res.pushConfigured === false) {
          // In-app notification saved, but the server can't send FCM (no Firebase
          // service account configured) — tell the truth instead of "N devices".
          this.dialog.toast(`Saved for ${owners}. Push is not configured on the server, so no device alerts were sent.`, 'info');
        } else if ((res.devices ?? 0) === 0) {
          this.dialog.toast(`Saved for ${owners}, but none of them have a registered device yet.`, 'info');
        } else {
          this.dialog.toast(`Sent to ${owners} — ${res.pushed} device${res.pushed === 1 ? '' : 's'} pushed${res.skipped ? `, ${res.skipped} skipped` : ''}${res.failed ? `, ${res.failed} failed` : ''}.`, 'success');
        }
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
        next: () => { this.busyId.set(null); this.patchDrawerShop(s.id, { isActive: !s.isActive }); this.load(); this.loadOverview(); this.dialog.toast(action === 'suspend' ? 'Shop suspended' : 'Shop activated', 'success'); },
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

  // Keep the open drawer's header in sync after an in-drawer action (the list
  // reload replaces row objects, so mutating `s` alone wouldn't re-render).
  private patchDrawerShop(id: number, patch: any) {
    const cur = this.drawerShop();
    if (cur && cur.id === id) this.drawerShop.set({ ...cur, ...patch });
  }

  // ── View as shop (impersonate) ──
  viewAsShop(s: any) {
    this.busyId.set(s.id);
    this.auth.impersonate(s.id).subscribe({
      next: () => { this.busyId.set(null); this.closeDrawer(); this.router.navigateByUrl('/admin'); this.dialog.toast(`Now viewing as ${s.name}`, 'success'); },
      error: (e) => { this.busyId.set(null); this.dialog.toast(e.error?.error || 'Could not view as shop', 'error'); },
    });
  }

  // ── Edit shop (name / code) ──
  readonly editShopId = signal<number | null>(null);
  edName = ''; edCode = '';
  readonly edBusy = signal(false); readonly edErr = signal(false); readonly edMsg = signal('');
  openEditShop(s: any) { this.editShopId.set(s.id); this.edName = s.name; this.edCode = s.code; this.edErr.set(false); this.edMsg.set(''); }
  saveEditShop(s: any) {
    const name = this.edName.trim(), code = this.edCode.trim().toUpperCase();
    if (!name || !code) { this.edErr.set(true); this.edMsg.set('Name and code are required.'); return; }
    this.edBusy.set(true); this.edErr.set(false); this.edMsg.set('');
    this.service.editShop(s.id, name, code).subscribe({
      next: () => { this.edBusy.set(false); this.editShopId.set(null); this.patchDrawerShop(s.id, { name, code }); this.load(); this.dialog.toast('Shop updated', 'success'); },
      error: (e) => { this.edBusy.set(false); this.edErr.set(true); this.edMsg.set(e.error?.error || 'Could not save.'); },
    });
  }

  archiveShop(s: any) {
    this.dialog.confirm('Archive shop', `Archive "${s.name}"? It's hidden from the list and staff can't sign in. Nothing is deleted — you can restore it any time.`).then(ok => {
      if (!ok) return;
      this.service.archiveShop(s.id).subscribe({
        next: () => { this.patchDrawerShop(s.id, { isArchived: true, isActive: false }); this.load(); this.loadOverview(); this.dialog.toast('Shop archived', 'success'); },
        error: (e) => this.dialog.toast(e.error?.error || 'Failed', 'error'),
      });
    });
  }
  restoreShop(s: any) {
    this.service.restoreShop(s.id).subscribe({
      next: () => { this.patchDrawerShop(s.id, { isArchived: false, isActive: true }); this.load(); this.loadOverview(); this.dialog.toast('Shop restored', 'success'); },
      error: (e) => this.dialog.toast(e.error?.error || 'Failed', 'error'),
    });
  }
  deleteShop(s: any) {
    this.dialog.confirm('Delete shop permanently', `PERMANENTLY delete "${s.name}"? This cannot be undone. Only shops with no sales history can be deleted — otherwise archive it instead.`).then(ok => {
      if (!ok) return;
      this.service.deleteShop(s.id).subscribe({
        next: () => { this.closeDrawer(); this.load(); this.loadOverview(); this.dialog.toast('Shop deleted', 'success'); },
        error: (e) => this.dialog.toast(e.error?.error || 'Could not delete', 'error'),
      });
    });
  }

  // ── Billing / subscription ──
  readonly billingOpen = signal(false);
  biPlan = ''; biPrice = 0; biStatus = 'trial'; biTrial = ''; biNext = ''; biNotes = '';
  readonly biBusy = signal(false);
  openBilling(shop: any) {
    this.biPlan = shop.billingPlan || 'Trial';
    this.biPrice = shop.monthlyPrice ?? 0;
    this.biStatus = shop.billingStatus || 'trial';
    this.biTrial = shop.trialEndsAt ? String(shop.trialEndsAt).slice(0, 10) : '';
    this.biNext = shop.nextBillingAt ? String(shop.nextBillingAt).slice(0, 10) : '';
    this.biNotes = shop.billingNotes || '';
    this.billingOpen.set(true);
  }
  saveBilling(shop: any) {
    this.biBusy.set(true);
    this.service.updateShopBilling(shop.id, {
      billingPlan: this.biPlan.trim(),
      monthlyPrice: Number(this.biPrice) || 0,
      billingStatus: this.biStatus,
      trialEndsAt: this.biTrial || null,
      nextBillingAt: this.biNext || null,
      billingNotes: this.biNotes.trim() || null,
    }).subscribe({
      next: () => { this.biBusy.set(false); this.billingOpen.set(false); this.openDetail(shop); this.load(); this.loadOverview(); this.dialog.toast('Billing updated', 'success'); },
      error: (e) => { this.biBusy.set(false); this.dialog.toast(e.error?.error || 'Could not save billing', 'error'); },
    });
  }

  // ── Staff management (any shop) ──
  readonly addStaffOpen = signal(false);
  stName = ''; stUser = ''; stPass = ''; stRole = 'cashier';
  readonly stBusy = signal(false); readonly stErr = signal(false); readonly stMsg = signal('');
  toggleAddStaff() { this.addStaffOpen.set(!this.addStaffOpen()); this.stName = ''; this.stUser = ''; this.stPass = ''; this.stRole = 'cashier'; this.stErr.set(false); this.stMsg.set(''); }
  saveStaff(s: any) {
    const displayName = this.stName.trim(), username = this.stUser.trim();
    if (!displayName || !username || !this.stPass) { this.stErr.set(true); this.stMsg.set('Name, username and password are required.'); return; }
    this.stBusy.set(true); this.stErr.set(false); this.stMsg.set('');
    this.service.addStaff(s.id, { username, password: this.stPass, displayName, role: this.stRole }).subscribe({
      next: () => { this.stBusy.set(false); this.addStaffOpen.set(false); this.openDetail(s); this.dialog.toast('Staff added', 'success'); },
      error: (e) => { this.stBusy.set(false); this.stErr.set(true); this.stMsg.set(e.error?.error || 'Could not add staff.'); },
    });
  }
  resetStaffPw(s: any, u: any) {
    this.dialog.confirm('Reset password', `Generate a new password for ${u.displayName || u.username}?`).then(ok => {
      if (!ok) return;
      this.service.resetStaffPassword(s.id, u.id).subscribe({
        next: (res) => this.dialog.reveal('New password', `For ${res.username} (${res.displayName}). Relay it — shown only once.`, res.password),
        error: (e) => this.dialog.toast(e.error?.error || 'Failed', 'error'),
      });
    });
  }
  removeStaff(s: any, u: any) {
    this.dialog.confirm('Remove staff', `Remove ${u.displayName || u.username} from ${s.name}? This deletes their login.`).then(ok => {
      if (!ok) return;
      this.service.deleteStaff(s.id, u.id).subscribe({
        next: () => { this.openDetail(s); this.dialog.toast('Staff removed', 'success'); },
        error: (e) => this.dialog.toast(e.error?.error || 'Failed', 'error'),
      });
    });
  }
}
