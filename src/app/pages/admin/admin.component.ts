import { Component, inject, signal, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MenuItemService } from '../../menu-item.service';
import { MenuItem } from '../../menu-item.model';
import { Category } from '../../category.model';
import { AuthService } from '../../auth.service';
import { BtnComponent } from '../../btn.component';
import { PasswordInputComponent } from '../../password-input.component';
import { ReceiptViewComponent } from '../../receipt-view.component';
import { PrintService } from '../../print.service';
import { DialogService } from '../../dialog.service';
import { SoundService } from '../../sound.service';
import { firstValueFrom } from 'rxjs';
import { ThemeService } from '../../theme.service';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, BtnComponent, PasswordInputComponent, ReceiptViewComponent],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.scss',
})
export class AdminComponent implements OnInit {
  private service = inject(MenuItemService);
  private auth = inject(AuthService);
  private dialog = inject(DialogService);
  private sound = inject(SoundService);
  readonly tab = signal<'inventory' | 'categories' | 'users' | 'orders' | 'analytics' | 'discounts' | 'settings'>('inventory');

  // Inventory
  readonly items = signal<MenuItem[]>([]);
  invQuery = '';
  readonly invFilter = signal<'all' | 'low' | 'out'>('all');
  readonly LOW_STOCK = 10;
  readonly summary = signal<any>(null);
  readonly showForm = signal(false);
  readonly editing = signal<MenuItem | null>(null);
  fName = ''; fCategory = ''; fPrice: number | null = null; fStock: number | null = null; fLowStock = 5; fDesc = ''; fAvail = true;
  fImageUrl = ''; fImagePublicId = ''; readonly uploading = signal(false);
  readonly themeService = inject(ThemeService);
  pendingImage: File | null = null;
  pendingImageUrl: string | null = null;
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
  brName = ''; brLogoUrl = ''; brQrUrl = ''; brKitchenUrl = '';
  readonly kitchenScanning = signal(false);
  readonly kitchenFound = signal<string | null>(null);
  readonly kitchenMsg = signal('');
  readonly brMsg = signal(''); readonly brErr = signal(false); readonly brBusy = signal(false);
  pendingLogo: File | null = null;
  pendingLogoUrl: string | null = null;
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
  @ViewChild('adminReceiptBox') receiptBox!: ElementRef<HTMLElement>;
  private printer = inject(PrintService);
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

  ngOnInit() { this.loadInv(); this.loadSum(); this.loadUsers(); this.loadCategories(); this.loadSettings(); this.loadOrders(); this.loadShopInfo(); this.loadDiscounts(); this.loadNotifications(); this.startNotifPoll(); }

  // ── Notification bell ────────────────────────────────

  readonly notifItems = signal<any[]>([]);
  readonly notifUnread = signal(0);
  readonly bellOpen = signal(false);
  private notifTimer: any;
  private lastUnread = 0;

  toggleBell() {
    this.bellOpen.update(v => !v);
    if (this.bellOpen()) this.loadNotifications();
  }

  private loadNotifications() {
    this.service.getNotifications().subscribe({
      next: (res) => {
        this.notifItems.set(res.items ?? []);
        this.notifUnread.set(res.unread ?? 0);
        // Ping only when NEW unread arrived (not on the initial baseline).
        if (this.lastUnread > 0 && (res.unread ?? 0) > this.lastUnread) this.sound.notification();
        this.lastUnread = res.unread ?? 0;
      },
      error: () => { /* bell stays silent on failure */ }
    });
  }

  private startNotifPoll() {
    this.notifTimer = setInterval(() => this.loadNotifications(), 45000);
  }

  ngOnDestroy() { if (this.notifTimer) clearInterval(this.notifTimer); }

  markRead(n: any) {
    if (n.readAtUtc) return;
    n.readAtUtc = new Date().toISOString();
    this.notifUnread.update(u => Math.max(0, u - 1));
    this.service.markNotificationRead(n.id).subscribe({ error: () => this.loadNotifications() });
  }

  markAllRead() {
    if (this.notifUnread() === 0) return;
    this.notifItems.update(items => items.map(i => i.readAtUtc ? i : { ...i, readAtUtc: new Date().toISOString() }));
    this.notifUnread.set(0);
    this.service.markAllNotificationsRead().subscribe({ error: () => this.loadNotifications() });
  }

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
      if (f === 'low' && i.stockQuantity >= (i.lowStockThreshold ?? 5)) return false;
      if (f === 'out' && i.stockQuantity >= 1) return false;
      return true;
    });
  }

  openNew() { this.resetInv(); this.showForm.set(true); }
  edit(item: MenuItem) { this.clearPendingImage(); this.editing.set(item); this.fName = item.name; this.fCategory = item.category; this.fPrice = item.price; this.fStock = item.stockQuantity; this.fLowStock = item.lowStockThreshold ?? 5; this.fDesc = item.description ?? ''; this.fAvail = item.isAvailable; this.fImageUrl = item.imageUrl ?? ''; this.fImagePublicId = item.imagePublicId ?? ''; this.fSizes = (item.sizes ?? []).map(s => ({ id: s.id, name: s.name, price: s.price })); this.fGroups = (item.modifierGroups ?? []).map(g => ({ id: g.id, name: g.name, isMulti: g.isMulti, modifiers: g.modifiers.map(m => ({ id: m.id, name: m.name, priceDelta: m.priceDelta })) })); this.showForm.set(true); }
  closeForm() { this.showForm.set(false); this.editing.set(null); this.clearPendingImage(); }
  addSizeRow() { this.fSizes = [...this.fSizes, { id: 0, name: '', price: 0 }]; }
  removeSizeRow(i: number) { this.fSizes = this.fSizes.filter((_, idx) => idx !== i); }
  addGroup() { this.fGroups = [...this.fGroups, { id: 0, name: '', isMulti: false, modifiers: [] }]; }
  removeGroup(i: number) { this.fGroups = this.fGroups.filter((_, idx) => idx !== i); }
  addMod(g: { modifiers: { id: number; name: string; priceDelta: number }[] }) { g.modifiers = [...g.modifiers, { id: 0, name: '', priceDelta: 0 }]; }
  removeMod(g: { modifiers: { id: number; name: string; priceDelta: number }[] }, i: number) { g.modifiers = g.modifiers.filter((_, idx) => idx !== i); }
  async save() {
    if (!this.fCategory.trim()) { this.dialog.toast('Choose a category', 'error'); return; }
    const sizes = this.fSizes.filter(s => s.name.trim()).map(s => ({ id: s.id, name: s.name.trim(), price: s.price ?? 0 }));
    const modifierGroups = this.fGroups.filter(g => g.name.trim()).map(g => ({
      id: g.id, name: g.name.trim(), isMulti: g.isMulti,
      modifiers: g.modifiers.filter(m => m.name.trim()).map(m => ({ id: m.id, name: m.name.trim(), priceDelta: m.priceDelta ?? 0 }))
    }));
    let imageUrl = this.fImageUrl || null;
    let imagePublicId = this.fImagePublicId || null;
    // Upload only when the user actually saves - picking then cancelling an
    // image must never leave an orphaned file in Cloudinary.
    if (this.pendingImage) {
      this.uploading.set(true);
      try {
        const res = await firstValueFrom(this.service.uploadImage(this.pendingImage));
        imageUrl = res.url;
        imagePublicId = res.publicId;
      } catch {
        this.uploading.set(false);
        this.dialog.toast('Image upload failed', 'error');
        return;
      }
      this.uploading.set(false);
    }
    this.service.writeItem({ id: this.editing()?.id ?? 0, name: this.fName, category: this.fCategory, price: this.fPrice ?? 0, stockQuantity: this.fStock ?? 0, lowStockThreshold: this.fLowStock ?? 5, description: this.fDesc || null, imageUrl, imagePublicId, isAvailable: this.fAvail, sizes, modifierGroups }).subscribe({ next: () => { this.loadInv(); this.closeForm(); }, error: () => this.dialog.toast('Save failed', 'error') });
  }
  remove(id: number) {
    this.dialog.confirm('Delete item', 'Delete this item?').then(ok => {
      if (ok) this.service.deleteItem(id).subscribe({ next: () => this.loadInv(), error: () => this.dialog.toast('Delete failed', 'error') });
    });
  }
  private resetInv() { this.fName = ''; this.fCategory = ''; this.fPrice = null; this.fStock = null; this.fLowStock = 5; this.fDesc = ''; this.fAvail = true; this.fImageUrl = ''; this.fImagePublicId = ''; this.fSizes = []; this.fGroups = []; this.clearPendingImage(); }

  onImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    // No upload here - just keep the file locally for preview. It goes to
    // Cloudinary only when the form is saved (see save()).
    this.clearPendingImage();
    this.pendingImage = file;
    this.pendingImageUrl = URL.createObjectURL(file);
  }

  clearImage() { this.fImageUrl = ''; this.fImagePublicId = ''; this.clearPendingImage(); }

  private clearPendingImage() {
    if (this.pendingImageUrl) { URL.revokeObjectURL(this.pendingImageUrl); this.pendingImageUrl = null; }
    this.pendingImage = null;
  }

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

  // Voiding is a one-way door on the till: require a manager PIN first.
  async voidOrder(o: any) {
    const pin = await this.dialog.prompt('Manager PIN required', `Enter the manager PIN to void order #${o.id} (R${o.total.toFixed(2)}). Stock is returned to inventory.`);
    if (!pin) return;
    this.service.verifyPin(pin).subscribe({
      next: (res) => {
        if (!res.valid) { this.dialog.toast('Invalid PIN — void cancelled', 'error'); return; }
        this.askVoidReason(o);
      },
      error: (e) => this.dialog.toast(e.error?.error || 'Could not verify PIN', 'error')
    });
  }

  // Reprint a receipt from the order detail: native uses the Android print
  // framework, web falls back to the system print dialog.
  printReceipt() {
    const el = this.receiptBox?.nativeElement?.querySelector('.receipt-print') as HTMLElement | null;
    if (!el) { this.dialog.toast('Receipt not ready', 'error'); return; }
    void this.printer.printReceiptHtml(el.outerHTML).then(ok => {
      if (!ok) { this.dialog.toast('No printer available - opening system print', 'error'); window.print(); }
    });
  }

  // Refunds: manager PIN first, then amount (bounded by what's still
  // refundable), then a reason for the audit trail. Stock is NOT returned -
  // the items were already sold (void is the restock path).
  async refundOrder(o: any) {
    const remaining = Math.max(0, (o.total ?? 0) - (o.refundedAmount ?? 0));
    if (remaining <= 0) { this.dialog.toast('Nothing left to refund on this order', 'info'); return; }
    const pin = await this.dialog.prompt('Manager PIN required', `Enter the manager PIN to refund order #${o.id}. Refundable: R${remaining.toFixed(2)}.`);
    if (!pin) return;
    this.service.verifyPin(pin).subscribe({
      next: (res) => {
        if (!res.valid) { this.dialog.toast('Invalid PIN - refund cancelled', 'error'); return; }
        this.askRefundAmount(o, remaining);
      },
      error: (e) => this.dialog.toast(e.error?.error || 'Could not verify PIN', 'error')
    });
  }

  private askRefundAmount(o: any, remaining: number) {
    this.dialog.prompt('Refund order', `Order #${o.id} - enter the amount to refund (max R${remaining.toFixed(2)}). Stock is NOT returned - the items were already sold.`, {
      inputType: 'text',
      placeholder: '0.00'
    }).then(amt => {
      const amount = parseFloat((amt ?? '').replace(',', '.'));
      if (!Number.isFinite(amount) || amount <= 0 || amount > remaining + 0.001) {
        this.dialog.toast('Invalid refund amount', 'error');
        return;
      }
      this.askRefundReason(o, Math.round(amount * 100) / 100);
    });
  }

  private askRefundReason(o: any, amount: number) {
    this.dialog.prompt('Refund reason', `Refund R${amount.toFixed(2)} on order #${o.id} - a reason is required for the audit trail.`, {
      inputType: 'text',
      placeholder: 'Reason (e.g. customer returned drink)'
    }).then(reason => {
      const r = reason?.trim();
      if (!r) return;
      this.service.refundOrder(o.id, amount, r).subscribe({
        next: () => {
          this.dialog.toast(`R${amount.toFixed(2)} refunded on order #${o.id}`, 'success');
          this.loadOrders();
          this.loadSum();
        },
        error: (e) => this.dialog.toast(e.error?.error || 'Refund failed', 'error')
      });
    });
  }

  // One-tap kitchen discovery: probe port 8123 across the local /24 subnet.
  // Only responses carrying our marker are accepted; manual entry still works
  // if the network blocks discovery (client isolation) or it's a different
  // subnet. Runs on an explicit tap - never in the background.
  findKitchen() {
    this.kitchenScanning.set(true);
    this.kitchenFound.set(null);
    this.kitchenMsg.set('');
    void this.getLocalIp().then(ip => {
      if (!ip) {
        this.kitchenScanning.set(false);
        this.kitchenMsg.set('Could not determine this device\'s IP — enter the kitchen address manually.');
        return;
      }
      const parts = ip.split('.');
      const base = `${parts[0]}.${parts[1]}.${parts[2]}.`;
      const hosts = Array.from({ length: 254 }, (_, i) => `${base}${i + 1}`);
      void this.probeHosts(hosts).then(found => {
        this.kitchenScanning.set(false);
        if (found) {
          this.brKitchenUrl = found;
          this.kitchenFound.set(`Found kitchen tablet at ${found} — save to use it`);
        } else {
          this.kitchenMsg.set('No kitchen tablet found — check both tablets are on the same WiFi, or type the address.');
        }
      });
    });
  }

  private async probeHosts(hosts: string[]): Promise<string | null> {
    const { CapacitorHttp } = await import('@capacitor/core');
    for (let i = 0; i < hosts.length; i += 32) {
      const batch = hosts.slice(i, i + 32);
      const results = await Promise.all(batch.map(async h => {
        try {
          const r = await CapacitorHttp.get({ url: `http://${h}:8123/ping`, connectTimeout: 700, readTimeout: 700 });
          if (r.status === 200 && typeof r.data === 'string' && r.data.includes('coffeeshoppro-kitchen')) return h;
          return null;
        } catch { return null; }
      }));
      const hit = results.find(Boolean);
      if (hit) return hit;
    }
    return null;
  }

  // Local IP via WebRTC ICE (works in the Chromium WebView, no native code).
  private getLocalIp(): Promise<string | null> {
    return new Promise(resolve => {
      try {
        const pc = new RTCPeerConnection({ iceServers: [] });
        let done = false;
        const finish = (ip: string | null) => { if (!done) { done = true; pc.close(); resolve(ip); } };
        pc.onicecandidate = (e: any) => {
          if (!e.candidate) { finish(null); return; }
          const m = /([0-9]{1,3}(\.[0-9]{1,3}){3})/.exec(e.candidate.candidate);
          if (m) { const ip = m[1]; if (!ip.startsWith('127.') && !ip.startsWith('169.254.')) finish(ip); }
        };
        pc.createDataChannel('x');
        void pc.createOffer().then(o => pc.setLocalDescription(o)).catch(() => finish(null));
        setTimeout(() => finish(null), 3000);
      } catch { resolve(null); }
    });
  }

  private askVoidReason(o: any) {
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
      this.brKitchenUrl = shop.kitchenUrl ?? '';
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
    // Same deferred pattern as menu photos: upload happens in saveBranding().
    this.clearPendingLogo();
    this.pendingLogo = file;
    this.pendingLogoUrl = URL.createObjectURL(file);
  }

  clearLogo() { this.brLogoUrl = ''; this.clearPendingLogo(); }

  private clearPendingLogo() {
    if (this.pendingLogoUrl) { URL.revokeObjectURL(this.pendingLogoUrl); this.pendingLogoUrl = null; }
    this.pendingLogo = null;
  }

  async saveBranding() {
    this.brBusy.set(true); this.brErr.set(false); this.brMsg.set('');
    let logoUrl = this.brLogoUrl || null;
    if (this.pendingLogo) {
      this.logoUploading.set(true);
      try {
        const res = await firstValueFrom(this.service.uploadImage(this.pendingLogo));
        logoUrl = res.url;
      } catch {
        this.logoUploading.set(false);
        this.brBusy.set(false);
        this.brMsg.set('Logo upload failed'); this.brErr.set(true);
        return;
      }
      this.logoUploading.set(false);
    }
    this.service.updateShopInfo({ name: this.brName, logoUrl, receiptQrUrl: this.brQrUrl.trim() || null, kitchenUrl: this.brKitchenUrl.trim() || null }).subscribe({
      next: () => { this.brMsg.set('Branding saved.'); this.brBusy.set(false); },
      error: (e) => { this.brMsg.set(e.error?.error || 'Failed'); this.brErr.set(true); this.brBusy.set(false); }
    });
  }
}
