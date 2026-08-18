import { Component, inject, signal, computed, effect, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
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
import { SortableDirective } from '../../sortable.directive';
import { environment } from '../../../environments/environment';
import { Capacitor } from '@capacitor/core';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, BtnComponent, PasswordInputComponent, ReceiptViewComponent, SortableDirective],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.scss',
})
export class AdminComponent implements OnInit {
  private service = inject(MenuItemService);
  private auth = inject(AuthService);
  private dialog = inject(DialogService);
  private sound = inject(SoundService);
  readonly tab = signal<'inventory' | 'categories' | 'users' | 'orders' | 'analytics' | 'cashup' | 'discounts' | 'settings' | 'timesheet' | 'journal' | 'audit' | 'customers' | 'purchasing' | 'expenses'>('inventory');

  // Timesheet: hours worked + wage cost per employee over a date range.
  readonly tsData = signal<any | null>(null);
  readonly tsBusy = signal(false);
  readonly tsExpanded = signal<number | null>(null);
  readonly tsTotals = computed(() => {
    const d = this.tsData();
    const emps = d?.employees ?? [];
    return {
      shifts: emps.reduce((s: number, e: any) => s + e.shiftCount, 0),
      hours: emps.reduce((s: number, e: any) => s + e.totalHours, 0),
      cost: emps.reduce((s: number, e: any) => s + e.wageCost, 0)
    };
  });
  tsFrom = ''; tsTo = '';
  private initTimesheetRange() {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!this.tsFrom) this.tsFrom = fmt(first);
    if (!this.tsTo) this.tsTo = fmt(now);
  }
  openTimesheet() { this.initTimesheetRange(); this.tab.set('timesheet'); void this.loadTimesheet(); }
  loadTimesheet() {
    if (!this.tsFrom || !this.tsTo) { this.dialog.toast('Pick a date range first', 'error'); return; }
    this.tsBusy.set(true);
    this.service.getTimesheet(this.tsFrom, this.tsTo).subscribe({
      next: (d) => { this.tsData.set(d); this.tsBusy.set(false); },
      error: () => { this.tsBusy.set(false); this.dialog.toast('Failed to load timesheet', 'error'); }
    });
  }
  toggleTsRow(id: number) { this.tsExpanded.set(this.tsExpanded() === id ? null : id); }
  fmtHours(h: number): string {
    const total = Math.round(h * 60);
    const hrs = Math.floor(total / 60);
    const mins = total % 60;
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  }

  // Owner backup: this shop's full data (menu, orders, users, shifts) as JSON.
  readonly backupMsg = signal('');
  async downloadBackup(): Promise<void> {
    const token = this.auth.token;
    if (!token) { this.backupMsg.set('Not signed in'); return; }
    try {
      const res = await fetch(`${environment.apiBase}/admin/export/shop`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { this.backupMsg.set(`Backup failed (HTTP ${res.status})`); return; }
      const text = await res.text();
      const name = `shop-backup-${new Date().toISOString().slice(0, 10)}.json`;
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
  fCostBasis: number | null = null;
  fRecipe: { id: number; name: string; costPerUnit: number; quantity: number }[] = [];
  fSku = '';
  readonly recipeCost = computed(() => this.fRecipe.reduce((s, r) => s + (r.costPerUnit || 0) * (r.quantity || 0), 0));
  @ViewChild('skuCanvas') skuCanvasRef!: ElementRef<HTMLCanvasElement>;

  // SKU / barcode for prepacked items: generate a unique one, render the
  // Code-128 barcode client-side (JsBarcode), and print a label.
  genSku() {
    const s = 'SKU-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
    this.fSku = s;
    this.renderSku();
  }

  renderSku() {
    if (!this.fSku) return;
    void import('jsbarcode').then((m: any) => {
      const JsBarcode = m.default ?? m;
      const cv = this.skuCanvasRef?.nativeElement;
      if (cv) JsBarcode(cv, this.fSku, { format: 'CODE128', width: 2, height: 56, displayValue: true, background: '#ffffff', lineColor: '#111111', margin: 4 });
    }).catch(() => { /* barcode lib unavailable */ });
  }

  printSkuLabel() {
    if (!this.fSku) { this.dialog.toast('Generate a SKU first', 'info'); return; }
    void import('jsbarcode').then((m: any) => {
      const JsBarcode = m.default ?? m;
      const cv = document.createElement('canvas');
      JsBarcode(cv, this.fSku, { format: 'CODE128', width: 3, height: 80, displayValue: true, background: '#ffffff', lineColor: '#111111' });
      const w = window.open('', '_blank');
      if (!w) { this.dialog.toast('Pop-up blocked - allow pop-ups to print', 'error'); return; }
      const esc = (v: any) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
      w.document.write(`<!doctype html><html><head><title>Barcode label</title><style>body{text-align:center;padding:2rem;font-family:Arial,sans-serif;color:#111}img{width:300px;background:#fff;padding:.5rem;border:1px dashed #ccc}.name{font-size:20px;font-weight:700;margin:.6rem 0 .1rem}.sku{font-size:13px;color:#555;margin-bottom:.3rem}.price{font-size:19px;font-weight:700}</style></head><body><img src="${cv.toDataURL()}"/><div class="name">${esc(this.fName)}</div><div class="sku">${esc(this.fSku)}</div><div class="price">R${(this.fPrice ?? 0).toFixed(2)}</div><script>window.onload=function(){window.print()}<\/script></body></html>`);
      w.document.close();
    }).catch(() => this.dialog.toast('Could not build the label', 'error'));
  }

  // Users
  readonly users = signal<any[]>([]);
  usersQ = '';
  readonly filteredUsers = computed(() => {
    const q = this.usersQ.trim().toLowerCase();
    if (!q) return this.users();
    return this.users().filter((u: any) =>
      `${u.username} ${u.displayName ?? ''} ${u.role}`.toLowerCase().includes(q));
  });
  readonly showUserForm = signal(false);
  uName = ''; uPass = ''; uDisplay = ''; uRole: 'cashier' | 'admin' = 'cashier'; uPin = ''; uWage = '';
  uEditId: number | null = null; // null = creating a new user, else editing

  // Categories
  readonly categories = signal<Category[]>([]);
  catsQ = '';
  readonly filteredCats = computed(() => {
    const q = this.catsQ.trim().toLowerCase();
    if (!q) return this.categories();
    return this.categories().filter((c: any) =>
      `${c.name} ${c.station ?? ''}`.toLowerCase().includes(q));
  });
  readonly showCatForm = signal(false);
  readonly editingCat = signal<Category | null>(null);
  catName = '';
  catStation: 'kitchen' | 'bar' | 'both' = 'both';

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
  readonly ordersTotal = signal(0);
  ordersFrom = '';
  ordersTo = '';
  private static readonly ORDERS_PAGE = 200;
  private ordersOffset = 0;

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

  // Print a PDF report from the data ALREADY on the page (zero server load):
  // jsPDF draws the metric cards, a colourful bar chart and the tables, then
  // opens it with the print dialog.
  printAnalytics() {
    const a = this.analytics();
    if (!a) { this.dialog.toast('Load analytics first', 'info'); return; }
    void import('jspdf').then(({ jsPDF }) => {
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const W = 210;
      const shop = this.shopInfo?.name ?? 'CoffeeShop Pro';
      let y = 16;

      doc.setFontSize(16); doc.setTextColor(40, 40, 40);
      doc.text(`${shop} - Analytics`, 14, y); y += 6;
      doc.setFontSize(9); doc.setTextColor(130, 130, 130);
      doc.text(`Last ${a.days} days · Generated ${new Date().toLocaleString()}${this.auth.getUser()?.displayName ? ' · ' + this.auth.getUser()!.displayName : ''}`, 14, y); y += 9;

      // Metric cards
      const metrics = [
        [`R${Number(a.totals.revenue).toFixed(2)}`, 'Revenue'],
        [`R${Number(a.totals.grossProfit).toFixed(2)}`, 'Gross profit'],
        [`${a.totals.orders}`, 'Orders'],
        [`${a.totals.items}`, 'Items sold'],
      ];
      const mw = (W - 28 - 12) / 4;
      metrics.forEach((m, i) => {
        const x = 14 + i * (mw + 4);
        doc.setFillColor(247, 245, 242);
        doc.roundedRect(x, y, mw, 17, 2, 2, 'F');
        doc.setFontSize(13); doc.setTextColor(180, 83, 9); doc.text(m[0], x + 4, y + 8);
        doc.setFontSize(6.5); doc.setTextColor(120, 120, 120); doc.text(m[1].toUpperCase(), x + 4, y + 13);
      });
      y += 26;

      // Daily revenue bar chart (colourful, drawn with rects)
      doc.setFontSize(12); doc.setTextColor(40, 40, 40);
      doc.text('Daily revenue', 14, y); y += 3;
      const max = Math.max(...a.daily.map((d: any) => Number(d.revenue)), 1);
      const chartW = W - 14 - 62;
      a.daily.forEach((d: any) => {
        const bw = Math.max(3, (Number(d.revenue) / max) * chartW);
        doc.setFillColor(200, 135, 56);
        doc.rect(14, y, bw, 4, 'F');
        doc.setFontSize(7); doc.setTextColor(90, 90, 90);
        doc.text(`${d.date}  R${Number(d.revenue).toFixed(2)}  (${d.orders} ord)`, 14 + bw + 2, y + 3);
        y += 6.4;
      });
      y += 7;

      // Tables: category + cashier
      const drawTable = (title: string, headers: string[], rows: (string | number)[][]) => {
        if (y > 245) { doc.addPage(); y = 16; }
        doc.setFontSize(12); doc.setTextColor(40, 40, 40);
        doc.text(title, 14, y); y += 2;
        const colW = (W - 28) / headers.length;
        doc.setFillColor(247, 245, 242);
        doc.rect(14, y, W - 28, 7, 'F');
        doc.setFontSize(8); doc.setTextColor(110, 110, 110);
        headers.forEach((h, i) => doc.text(h.toUpperCase(), 15 + i * colW, y + 5));
        y += 8;
        doc.setFontSize(9); doc.setTextColor(40, 40, 40);
        rows.forEach((r) => {
          if (y > 285) { doc.addPage(); y = 16; }
          doc.setDrawColor(230, 230, 230);
          doc.line(14, y - 1, W - 14, y - 1);
          r.forEach((cell, i) => doc.text(String(cell), 15 + i * colW, y + 3));
          y += 6.5;
        });
        y += 6;
      };

      drawTable('By category', ['Category', 'Qty', 'Revenue', 'Gross profit'],
        (a.categories ?? []).map((c: any) => [c.name, c.quantity, `R${Number(c.revenue).toFixed(2)}`, `R${Number(c.grossProfit).toFixed(2)}`]));
      drawTable('By cashier', ['Cashier', 'Orders', 'Revenue'],
        (a.cashiers ?? []).map((c: any) => [c.name, c.orders, `R${Number(c.revenue).toFixed(2)}`]));

      // Open with the print dialog (and still offer the download).
      doc.autoPrint();
      const url = doc.output('bloburl');
      window.open(url, '_blank');
    }).catch(() => this.dialog.toast('Could not build the PDF', 'error'));
  }

  // Discounts / specials
  readonly discounts = signal<any[]>([]);
  discQ = '';
  readonly filteredDiscs = computed(() => {
    const q = this.discQ.trim().toLowerCase();
    if (!q) return this.discounts();
    return this.discounts().filter((d: any) =>
      `${d.name} ${d.type}`.toLowerCase().includes(q));
  });
  readonly showDiscForm = signal(false);
  readonly editingDisc = signal<any | null>(null);
  dName = ''; dType: 'percent' | 'fixed' = 'percent'; dValue: number | null = null;
  dDay: number | null = null; dStart = ''; dEnd = ''; dActive = true;

  ngOnInit() { this.loadInv(); this.loadSum(); this.loadUsers(); this.loadCategories(); this.loadSettings(); this.loadOrders(); this.loadDiscounts(); this.loadNotifications(); this.startNotifPoll(); }

  // Auto-scroll the tab bar so the active tab is always visible (14+ tabs,
  // horizontal scroll). inline:nearest keeps already-visible tabs still.
  constructor() {
    effect(() => {
      const t = this.tab();
      if (t) {
        const el = document.querySelector('.tabs-scroll .tab.active') as HTMLElement | null;
        el?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
      }
    });
  }

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

  private loadInv() { this.service.getItems().subscribe(items => this.items.set(items)); }
  private loadSum() { this.service.getSummary().subscribe(s => this.summary.set(s)); }
  private loadUsers() { this.service.getUsers().subscribe(users => this.users.set(users)); }

  // Live filter over name + category; empty query shows everything.
  filteredItems(): MenuItem[] {
    const q = this.invQuery.trim().toLowerCase();
    const f = this.invFilter();
    return this.items().filter(i => {
      if (q && !(i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q) || (i.sku ?? '').toLowerCase().includes(q))) return false;
      if (f === 'low' && i.stockQuantity >= (i.lowStockThreshold ?? 5)) return false;
      if (f === 'out' && i.stockQuantity >= 1) return false;
      return true;
    });
  }

  openNew() { this.resetInv(); this.showForm.set(true); }
  edit(item: MenuItem) { this.clearPendingImage(); this.editing.set(item); this.fName = item.name; this.fCategory = item.category; this.fPrice = item.price; this.fStock = item.stockQuantity; this.fLowStock = item.lowStockThreshold ?? 5; this.fDesc = item.description ?? ''; this.fAvail = item.isAvailable; this.fImageUrl = item.imageUrl ?? ''; this.fImagePublicId = item.imagePublicId ?? ''; this.fCostBasis = (item as any).costBasis ?? null; this.fSku = (item as any).sku ?? ''; this.fSizes = (item.sizes ?? []).map(s => ({ id: s.id, name: s.name, price: s.price })); this.fGroups = (item.modifierGroups ?? []).map(g => ({ id: g.id, name: g.name, isMulti: g.isMulti, modifiers: g.modifiers.map(m => ({ id: m.id, name: m.name, priceDelta: m.priceDelta })) })); this.fRecipe = ((item as any).recipeLines ?? []).map((r: any) => ({ id: r.id, name: r.name, costPerUnit: r.costPerUnit, quantity: r.quantity })); this.showForm.set(true); setTimeout(() => this.renderSku(), 50); }
  closeForm() { this.showForm.set(false); this.editing.set(null); this.clearPendingImage(); }
  addSizeRow() { this.fSizes = [...this.fSizes, { id: 0, name: '', price: 0 }]; }
  removeSizeRow(i: number) { this.fSizes = this.fSizes.filter((_, idx) => idx !== i); }
  addGroup() { this.fGroups = [...this.fGroups, { id: 0, name: '', isMulti: false, modifiers: [] }]; }
  removeGroup(i: number) { this.fGroups = this.fGroups.filter((_, idx) => idx !== i); }
  addMod(g: { modifiers: { id: number; name: string; priceDelta: number }[] }) { g.modifiers = [...g.modifiers, { id: 0, name: '', priceDelta: 0 }]; }
  removeMod(g: { modifiers: { id: number; name: string; priceDelta: number }[] }, i: number) { g.modifiers = g.modifiers.filter((_, idx) => idx !== i); }
  addRecipeRow() { this.fRecipe = [...this.fRecipe, { id: 0, name: '', costPerUnit: 0, quantity: 1 }]; }
  removeRecipeRow(i: number) { this.fRecipe = this.fRecipe.filter((_, idx) => idx !== i); }
  async save() {
    if (!this.fCategory.trim()) { this.dialog.toast('Choose a category', 'error'); return; }
    const sizes = this.fSizes.filter(s => s.name.trim()).map(s => ({ id: s.id, name: s.name.trim(), price: s.price ?? 0 }));
    const modifierGroups = this.fGroups.filter(g => g.name.trim()).map(g => ({
      id: g.id, name: g.name.trim(), isMulti: g.isMulti,
      modifiers: g.modifiers.filter(m => m.name.trim()).map(m => ({ id: m.id, name: m.name.trim(), priceDelta: m.priceDelta ?? 0 }))
    }));
    const recipeLines = this.fRecipe.filter(r => r.name.trim()).map(r => ({ id: r.id, name: r.name.trim(), costPerUnit: r.costPerUnit ?? 0, quantity: r.quantity ?? 0 }));
    const sku = this.fSku.trim() || null;
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
    this.service.writeItem({ id: this.editing()?.id ?? 0, name: this.fName, category: this.fCategory, price: this.fPrice ?? 0, stockQuantity: this.fStock ?? 0, lowStockThreshold: this.fLowStock ?? 5, description: this.fDesc || null, imageUrl, imagePublicId, isAvailable: this.fAvail, sizes, modifierGroups, costBasis: this.fCostBasis ?? 0, recipeLines, sku }).subscribe({ next: () => { this.loadInv(); this.closeForm(); }, error: (e) => this.dialog.toast(e.error?.error || 'Save failed', 'error') });
  }
  remove(id: number) {
    this.dialog.confirm('Delete item', 'Delete this item?').then(ok => {
      if (ok) this.service.deleteItem(id).subscribe({ next: () => this.loadInv(), error: () => this.dialog.toast('Delete failed', 'error') });
    });
  }
  private resetInv() { this.fName = ''; this.fCategory = ''; this.fPrice = null; this.fStock = null; this.fLowStock = 5; this.fDesc = ''; this.fAvail = true; this.fImageUrl = ''; this.fImagePublicId = ''; this.fSizes = []; this.fGroups = []; this.fCostBasis = null; this.fRecipe = []; this.fSku = ''; this.clearPendingImage(); }

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
  editUser(u: any) {
    this.resetUser();
    this.uEditId = u.id;
    this.uDisplay = u.displayName ?? '';
    this.uRole = u.role === 'admin' ? 'admin' : 'cashier';
    this.uWage = u.wageRate != null ? String(u.wageRate) : '';
    this.showUserForm.set(true);
  }
  saveUser() {
    const wage = this.uWage.trim() === '' ? null : Number(this.uWage);
    const wageRate = wage != null && isFinite(wage) && wage > 0 ? wage : null;
    if (this.uEditId != null) {
      this.service.updateUser(this.uEditId, { displayName: this.uDisplay.trim(), role: this.uRole, wageRate }).subscribe({
        next: () => { this.loadUsers(); this.closeUserForm(); },
        error: (e) => this.dialog.toast(e.error?.error || 'Save failed', 'error')
      });
      return;
    }
    this.service.createUser({ username: this.uName, password: this.uPass, displayName: this.uDisplay, role: this.uRole, pin: this.uPin || null, wageRate }).subscribe({ next: () => { this.loadUsers(); this.closeUserForm(); }, error: (e) => this.dialog.toast(e.error?.error || 'Save failed', 'error') });
  }
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
  private resetUser() { this.uName = ''; this.uPass = ''; this.uDisplay = ''; this.uRole = 'cashier'; this.uPin = ''; this.uWage = ''; this.uEditId = null; }

  // ── Orders ─────────────────────────────────────────────

  loadOrders() {
    this.ordersBusy.set(true);
    this.ordersOffset = 0;
    this.service.getOrders(this.ordersFrom || undefined, this.ordersTo || undefined, AdminComponent.ORDERS_PAGE, 0).subscribe({
      next: ({ list, total }) => {
        this.orders.set(list);
        this.ordersTotal.set(total);
        // Keep the open detail in sync (e.g. after a void elsewhere).
        const sel = this.selectedOrder();
        if (sel) {
          const fresh = list.find(o => o.id === sel.id);
          this.selectedOrder.set(fresh ?? null);
        }
        this.ordersBusy.set(false);
      },
      error: () => this.ordersBusy.set(false)
    });
  }

  loadMoreOrders() {
    this.ordersOffset += AdminComponent.ORDERS_PAGE;
    this.ordersBusy.set(true);
    this.service.getOrders(this.ordersFrom || undefined, this.ordersTo || undefined, AdminComponent.ORDERS_PAGE, this.ordersOffset).subscribe({
      next: ({ list }) => {
        this.orders.update(existing => [...existing, ...list]);
        this.ordersBusy.set(false);
      },
      error: () => { this.ordersOffset -= AdminComponent.ORDERS_PAGE; this.ordersBusy.set(false); }
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

  // Cash-up (end of day): totals per payment method + per cashier for a day.
  readonly cashup = signal<any | null>(null);
  readonly cashupDate = signal(new Date().toISOString().slice(0, 10));

  setCashupDate(d: string) {
    this.cashupDate.set(d);
    this.loadCashup();
  }

  openCashup() {
    this.tab.set('cashup');
    if (!this.cashup()) this.loadCashup();
  }

  loadCashup() {
    this.service.getCashup(this.cashupDate()).subscribe(c => this.cashup.set(c));
  }

  barPct(revenue: number, daily: any[]): number {
    const max = Math.max(...daily.map(d => d.revenue), 1);
    return Math.max(2, Math.round((revenue / max) * 100));
  }

  // ── Transaction journal ────────────────────────────────────────────────

  readonly journal = signal<any | null>(null);
  readonly journalBusy = signal(false);
  journalFrom = ''; journalTo = '';
  jQ = '';
  readonly filteredJournal = computed(() => {
    const events = this.journal()?.events ?? [];
    const q = this.jQ.trim().toLowerCase();
    if (!q) return events;
    return events.filter((e: any) =>
      `${e.type} ${e.ref} ${e.detail}`.toLowerCase().includes(q));
  });
  setJournalEvents(events: any[]) {
    this.journal.update(j => (j ? { ...j, events } : j));
  }
  loadJournal() {
    this.journalBusy.set(true);
    this.service.getJournal(this.journalFrom || undefined, this.journalTo || undefined).subscribe({
      next: (j) => { this.journal.set(j); this.journalBusy.set(false); },
      error: () => { this.journalBusy.set(false); this.dialog.toast('Failed to load journal', 'error'); }
    });
  }

  // ── Audit trail ────────────────────────────────────────────────────────

  readonly audit = signal<any[]>([]);
  readonly auditBusy = signal(false);
  auditFrom = ''; auditTo = '';
  aQ = '';
  readonly filteredAudit = computed(() => {
    const q = this.aQ.trim().toLowerCase();
    if (!q) return this.audit();
    return this.audit().filter((a: any) =>
      `${a.action} ${a.by} ${a.detail}`.toLowerCase().includes(q));
  });
  loadAudit() {
    this.auditBusy.set(true);
    this.service.getAudit(this.auditFrom || undefined, this.auditTo || undefined).subscribe({
      next: (a) => { this.audit.set(a); this.auditBusy.set(false); },
      error: () => { this.auditBusy.set(false); this.dialog.toast('Failed to load audit log', 'error'); }
    });
  }

  // ── Customers (directory + house accounts) ────────────────────────────

  readonly customers = signal<any[]>([]);
  custQuery = '';
  readonly showCustForm = signal(false);
  custEditId: number | null = null;
  cfName = ''; cfPhone = ''; cfEmail = ''; cfLimit: number | null = null; cfNotes = '';
  loadCustomers() {
    this.service.getCustomers(this.custQuery.trim() || undefined).subscribe(c => this.customers.set(c));
  }
  openCustForm() { this.custEditId = null; this.cfName = ''; this.cfPhone = ''; this.cfEmail = ''; this.cfLimit = null; this.cfNotes = ''; this.showCustForm.set(true); }
  closeCustForm() { this.showCustForm.set(false); }
  editCustomer(c: any) { this.custEditId = c.id; this.cfName = c.name; this.cfPhone = c.phone ?? ''; this.cfEmail = c.email ?? ''; this.cfLimit = c.creditLimit; this.cfNotes = c.notes ?? ''; this.showCustForm.set(true); }
  saveCustomer() {
    const body = { name: this.cfName, phone: this.cfPhone.trim() || null, email: this.cfEmail.trim() || null, creditLimit: this.cfLimit ?? 0, notes: this.cfNotes.trim() || null };
    const call = this.custEditId ? this.service.updateCustomer(this.custEditId, body) : this.service.createCustomer(body);
    call.subscribe({ next: () => { this.loadCustomers(); this.closeCustForm(); }, error: (e) => this.dialog.toast(e.error?.error || 'Save failed', 'error') });
  }
  removeCustomer(c: any) {
    this.dialog.confirm('Delete customer', `Delete "${c.name}"?`).then(ok => {
      if (!ok) return;
      this.service.deleteCustomer(c.id).subscribe({ next: () => this.loadCustomers(), error: (e) => this.dialog.toast(e.error?.error || 'Delete failed', 'error') });
    });
  }
  settleCustomer(c: any) {
    this.dialog.prompt('Settle account', `"${c.name}" owes R${c.balance.toFixed(2)}. How much is being paid?`).then(amt => {
      const amount = parseFloat((amt ?? '').replace(',', '.'));
      if (!Number.isFinite(amount) || amount <= 0) { this.dialog.toast('Invalid amount', 'error'); return; }
      this.service.settleCustomer(c.id, amount, 'cash').subscribe({
        next: () => { this.dialog.toast('Account settled', 'success'); this.loadCustomers(); },
        error: (e) => this.dialog.toast(e.error?.error || 'Settle failed', 'error')
      });
    });
  }

  // ── Purchasing (suppliers + POs + receiving) ───────────────────────────

  readonly suppliers = signal<any[]>([]);
  readonly pos = signal<any[]>([]);
  poQ = '';
  readonly filteredPos = computed(() => {
    const q = this.poQ.trim().toLowerCase();
    if (!q) return this.pos();
    return this.pos().filter((p: any) =>
      `${p.supplierName} ${p.status}`.toLowerCase().includes(q));
  });
  readonly showSupplierForm = signal(false);
  readonly showPoForm = signal(false);
  supEditId: number | null = null;
  sfName = ''; sfPhone = ''; sfEmail = '';
  poSupplierId: number | null = null; poFreight: number | null = null; poDuty: number | null = null; poNotes = '';
  poLines: { menuItemId: number | null; quantity: number | null; unitCost: number | null }[] = [];
  readonly poBusy = signal(false);
  loadPurchasing() {
    this.service.getSuppliers().subscribe(s => this.suppliers.set(s));
    this.service.getPurchaseOrders().subscribe(p => this.pos.set(p));
  }
  openSupplierForm() { this.supEditId = null; this.sfName = ''; this.sfPhone = ''; this.sfEmail = ''; this.showSupplierForm.set(true); }
  closeSupplierForm() { this.showSupplierForm.set(false); }
  saveSupplier() {
    const body = { name: this.sfName, phone: this.sfPhone.trim() || null, email: this.sfEmail.trim() || null };
    const call = this.supEditId ? this.service.updateSupplier(this.supEditId, body) : this.service.createSupplier(body);
    call.subscribe({ next: () => { this.loadPurchasing(); this.closeSupplierForm(); }, error: (e) => this.dialog.toast(e.error?.error || 'Save failed', 'error') });
  }
  openPoForm() { this.poSupplierId = null; this.poFreight = null; this.poDuty = null; this.poNotes = ''; this.poLines = [{ menuItemId: null, quantity: null, unitCost: null }]; this.showPoForm.set(true); }
  closePoForm() { this.showPoForm.set(false); }
  addPoLine() { this.poLines = [...this.poLines, { menuItemId: null, quantity: null, unitCost: null }]; }
  removePoLine(i: number) { this.poLines = this.poLines.filter((_, idx) => idx !== i); }
  createPo() {
    const lines = this.poLines.filter(l => l.menuItemId && (l.quantity ?? 0) > 0).map(l => ({ menuItemId: l.menuItemId!, quantity: l.quantity!, unitCost: l.unitCost ?? 0 }));
    if (!this.poSupplierId || !lines.length) { this.dialog.toast('Pick a supplier and at least one line', 'error'); return; }
    this.poBusy.set(true);
    this.service.createPurchaseOrder({ supplierId: this.poSupplierId, freightCost: this.poFreight ?? 0, dutyCost: this.poDuty ?? 0, notes: this.poNotes.trim() || null, lines }).subscribe({
      next: () => { this.poBusy.set(false); this.closePoForm(); this.loadPurchasing(); this.dialog.toast('Purchase order created', 'success'); },
      error: (e) => { this.poBusy.set(false); this.dialog.toast(e.error?.error || 'Create failed', 'error'); }
    });
  }
  receivePo(po: any) {
    const remaining = po.lines.filter((l: any) => l.quantity > l.receivedQuantity);
    const msg = remaining.map((l: any) => `${l.itemName}: ${l.quantity - l.receivedQuantity} left`).join('; ');
    this.dialog.prompt('Receive stock', `Receiving PO #${po.id}. How many units arrived? (lines: ${msg})`, { placeholder: 'e.g. 10' }).then(amt => {
      const qty = parseInt(amt ?? '', 10);
      if (!Number.isFinite(qty) || qty <= 0) { this.dialog.toast('Enter a quantity', 'error'); return; }
      const lines = remaining.map((l: any) => ({ lineId: l.id, quantity: qty }));
      this.service.receivePurchaseOrder(po.id, lines).subscribe({
        next: (r) => { this.dialog.toast(`Received ${r.received?.length ?? 0} line(s) - stock added`, 'success'); this.loadPurchasing(); this.loadInv(); },
        error: (e) => this.dialog.toast(e.error?.error || 'Receive failed', 'error')
      });
    });
  }

  // ── Expenses & petty cash ──────────────────────────────────────────────

  readonly expenses = signal<any | null>(null);
  readonly showExpForm = signal(false);
  expFrom = ''; expTo = '';
  expQ = '';
  readonly filteredExpenses = computed(() => {
    const items = this.expenses()?.items ?? [];
    const q = this.expQ.trim().toLowerCase();
    if (!q) return items;
    return items.filter((e: any) =>
      `${e.category} ${e.note ?? ''}`.toLowerCase().includes(q));
  });
  setExpenseItems(items: any[]) {
    this.expenses.update(e => (e ? { ...e, items } : e));
  }
  efCategory = ''; efAmount: number | null = null; efNote = '';
  loadExpenses() {
    this.service.getExpenses(this.expFrom || undefined, this.expTo || undefined).subscribe(e => this.expenses.set(e));
  }
  openExpForm() { this.efCategory = ''; this.efAmount = null; this.efNote = ''; this.showExpForm.set(true); }
  closeExpForm() { this.showExpForm.set(false); }
  saveExpense() {
    if (!this.efCategory.trim() || (this.efAmount ?? 0) <= 0) { this.dialog.toast('Category and a positive amount are required', 'error'); return; }
    this.service.createExpense({ category: this.efCategory.trim(), amount: this.efAmount!, note: this.efNote.trim() || null }).subscribe({
      next: () => { this.loadExpenses(); this.closeExpForm(); this.dialog.toast('Expense logged', 'success'); },
      error: (e) => this.dialog.toast(e.error?.error || 'Failed', 'error')
    });
  }
  removeExpense(e: any) {
    this.dialog.confirm('Delete expense', `Delete "${e.category}" R${e.amount.toFixed(2)}?`).then(ok => {
      if (!ok) return;
      this.service.deleteExpense(e.id).subscribe({ next: () => this.loadExpenses(), error: () => this.dialog.toast('Delete failed', 'error') });
    });
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

  openCatForm() { this.editingCat.set(null); this.catName = ''; this.catStation = 'both'; this.showCatForm.set(true); }
  editCat(cat: Category) { this.editingCat.set(cat); this.catName = cat.name; this.catStation = (cat as any).station === 'kitchen' || (cat as any).station === 'bar' ? (cat as any).station : 'both'; this.showCatForm.set(true); }
  closeCatForm() { this.showCatForm.set(false); this.editingCat.set(null); }

  saveCat() {
    this.service.writeCategory({ id: this.editingCat()?.id ?? 0, name: this.catName, station: this.catStation }).subscribe({
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
      this.shopInfo = shop; // also feeds the receipt reprint (deduped: this used to be fetched twice on load)
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
