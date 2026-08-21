import { Component, effect, inject, signal, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { DEFAULT_PRODUCT_IMAGE } from '../../default-product-image';
import { IconComponent } from '../../icon.component';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { MenuItemService } from '../../menu-item.service';
import { MenuItem, ModifierGroup } from '../../menu-item.model';
import { AuthService } from '../../auth.service';
import { BtnComponent } from '../../btn.component';
import { DialogService } from '../../dialog.service';
import { ReceiptViewComponent } from '../../receipt-view.component';
import { AppLogoComponent } from '../../app-logo.component';
import { PrintService } from '../../print.service';
import { SoundService } from '../../sound.service';
import { OfflineService } from '../../offline.service';
import { UpdaterService } from '../../updater.service';
import { Capacitor } from '@capacitor/core';

interface CartItem { id: number; name: string; price: number; quantity: number; sizeId?: number; sizeName?: string; modifiers?: { groupName: string; name: string; priceDelta: number }[]; note?: string; }

// Semver-ish compare: "1.10" > "1.9", "1.3.0" == "1.3".
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

@Component({
  selector: 'app-pos',
  standalone: true,
  imports: [CommonModule, FormsModule, BtnComponent, ReceiptViewComponent, AppLogoComponent, IconComponent],
  templateUrl: './pos.component.html',
  styleUrl: './pos.component.scss',
})
export class PosComponent implements OnInit, OnDestroy {
  private service = inject(MenuItemService);
  private dialog = inject(DialogService);
  private router = inject(Router);
  private offline = inject(OfflineService);
  auth = inject(AuthService);

  // Service mode on the payment sheet: dine-in (with table) vs takeaway.
  readonly dineMode = signal<'takeaway' | 'dinein'>('takeaway');
  readonly tableNumber = signal('');

  // Items & cart
  items: MenuItem[] = [];
  readonly cart = signal<CartItem[]>([]);
  readonly busy = signal(false);
  readonly loading = signal(true);
  activeCat = 'Hot Drinks';
  // Bottom drawer on narrow screens (open by default on wide screens).
  readonly cartOpen = signal(typeof window !== 'undefined' && window.innerWidth > 1024);

  toggleCart() { this.cartOpen.update(v => !v); }

  // Search (top bar, always visible) — debounced 200ms so typing doesn't thrash.
  search = '';
  readonly query = signal('');
  private searchTimer: any;

  // Crash recovery: the cart survives an unexpected reload/termination.
  private readonly cartKey = 'pos_cart';
  private readonly persistCart = effect(() =>
    sessionStorage.setItem(this.cartKey, JSON.stringify(this.cart())));

  // Shop branding (logo)
  readonly shopInfo = signal<any>(null);

  // Shift
  readonly shiftActive = signal(false);
  readonly startingShift = signal(false);

  // Order complete overlay
  readonly complete = signal(false);

  // In-app updater: published release info when our version is behind
  readonly updateInfo = signal<{ version: string; releaseNotes: string; isRequired: boolean } | null>(null);
  readonly updateState = signal<'idle' | 'downloading' | 'ready' | 'failed'>('idle');
  readonly updateBlocked = signal(false);
  readonly updateError = signal('');
  readonly updateProgress = signal(0);
  private updater = inject(UpdaterService);

  // Till: payment sheet + receipt
  readonly paymentOpen = signal(false);
  readonly payMethod = signal<'cash' | 'card'>('cash');
  // Checkout extras: split payments and house-account charging (the order
  // goes on the customer's tab). Service charge + tips were removed from the
  // sheet to keep it clean (backend fields stay for receipts/reports).
  readonly splitMode = signal(false);
  splitRows: { method: 'cash' | 'card'; amount: number }[] = [];
  readonly accountMode = signal(false);
  readonly accountCustomerId = signal<number | null>(null);
  readonly accountCustomerName = signal('');
  readonly custSearch = signal('');
  readonly custResults = signal<any[]>([]);
  // Loyalty: an optional customer attached to a (non-account) sale to earn/redeem
  // stamps. Separate search state from the house-account picker above.
  readonly loyaltyCust = signal<any | null>(null);
  readonly loySearch = signal('');
  readonly loyResults = signal<any[]>([]);
  readonly loyaltyRedeem = signal(false);
  readonly receivedText = signal('');
  readonly lastOrder = signal<any | null>(null);

  // Discounts / specials
  readonly discounts = signal<any[]>([]);
  readonly selectedDiscount = signal<any | null>(null);
  readonly discountOpen = signal(false);

  // Product configurator (sizes + modifiers + note)
  readonly configurator = signal<{ item: MenuItem; sizeId: number | null; mods: Record<number, boolean>; note: string } | null>(null);
  // Checkout extras (optional)

  // Shift summary (shown at clock-out)
  readonly shiftSummary = signal<any | null>(null);
  cashCounted: number | null = null;
  // Cash expected in the till at clock-out: float + cash sales for the shift.
  readonly expectedTill = () => {
    const s = this.shiftSummary();
    if (!s) return null;
    return (s.cashRevenue ?? 0) + (s.startingFloat ?? 0);
  };
  floatInput = '';
  // Last completed order, kept for one-tap reprints after the receipt closes.
  readonly lastReceipt = signal<any | null>(null);
  @ViewChild('receiptBox') receiptBox!: ElementRef<HTMLElement>;
  private printer = inject(PrintService);
  private sound = inject(SoundService);

  get categories(): string[] { return [...new Set(this.items.map(i => i.category))].sort(); }
  searching(): boolean { return this.query().trim().length > 0; }

  // Debounce the keystrokes, then publish the query.
  onSearch() {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.query.set(this.search), 200);
  }

  // Search takes over from categories while text is typed; otherwise filter by the active category.
  readonly filtered = () => {
    const q = this.query().trim().toLowerCase();
    return q
      ? this.items.filter(i => i.name.toLowerCase().includes(q) || (i.sku ?? '').toLowerCase().includes(q))
      : this.items.filter(i => i.category === this.activeCat);
  };
  readonly total = () => this.cart().reduce((s, i) => s + i.price * i.quantity, 0);
  skeletonCards(): number[] { return [0, 1, 2, 3, 4, 5, 6, 7]; }

  // Pull a human-readable message out of an API error. Our endpoints return
  // { error } but ASP.NET ProblemDetails (500s, gateway timeouts) carry
  // title/detail instead - the generic "Checkout failed" hid those real
  // causes (e.g. the empty-migration 500).
  apiError(e: any): string | null {
    const b = e?.error;
    if (!b) return null;
    return (typeof b === 'string' && b) || b.error || b.title || b.message || b.detail || null;
  }

  // Stock guardrails — the cart can never exceed what we have. Stock is shared
  // across sizes, so the guard sums every line of the same item.
  stockOf(id: number): number { return this.items.find(i => i.id === id)?.stockQuantity ?? 0; }

  // Decrement on-hand stock locally after a sale (stock is shared across sizes,
  // so sum the quantities per item id). Avoids a full menu re-fetch per sale.
  private applyLocalStock(sold: CartItem[]) {
    if (!sold.length) return;
    const byId = new Map<number, number>();
    for (const line of sold) byId.set(line.id, (byId.get(line.id) ?? 0) + line.quantity);
    this.items = this.items.map(i =>
      byId.has(i.id) ? { ...i, stockQuantity: Math.max(0, i.stockQuantity - (byId.get(i.id) ?? 0)) } : i);
  }

  // Cloudinary thumbnail. POS grid tiles are small, but uploaded images are
  // stored up to 1920px. Inject a width/quality/format transform so each card
  // pulls a ~300px WebP instead of the full-res original - a big cut in image
  // traffic and decode time on the tablet.
  // Default product image (bundled data URI) shown when an item has none.
  readonly defaultProductImg = DEFAULT_PRODUCT_IMAGE;

  private thumbCache = new Map<string, string>();
  thumb(url: string | null | undefined): string {
    if (!url) return '';
    const hit = this.thumbCache.get(url);
    if (hit) return hit;
    const out = url.includes('/upload/')
      ? url.replace('/upload/', '/upload/w_300,h_300,c_fill,q_auto,f_auto/')
      : url;
    this.thumbCache.set(url, out);
    return out;
  }
  inCartAtStock(id: number): boolean {
    const inCart = this.cart().filter(i => i.id === id).reduce((s, i) => s + i.quantity, 0);
    return inCart >= this.stockOf(id);
  }

  // Sized items show their cheapest size on the card + the size names.
  minSizePrice(item: MenuItem): number { return Math.min(...(item.sizes ?? []).map(s => s.price)); }
  sizeNames(item: MenuItem): string { return (item.sizes ?? []).map(s => s.name).join(' · '); }

  ngOnInit() { this.restoreCart(); this.load(); this.checkShift(); this.loadShop(); this.loadDiscounts(); void this.loadAppVersion(); void this.checkForUpdate(); void this.listenForUpdateTriggers();
    // Offline orders replay when the internet returns - ping the kitchen for
    // each one so the display updates instantly instead of waiting for its poll.
    this.offline.orderSynced.subscribe(order => this.pingKitchen(order?.id, order?.items));
    this.startStockSync();
    // Capture phase so we see the scanner burst before any focused control.
    document.addEventListener('keydown', this.hidListener, true);
  }

  ngOnDestroy() {
    if (this.stockTimer) { clearInterval(this.stockTimer); this.stockTimer = null; }
    document.removeEventListener('keydown', this.hidListener, true);
  }

  // ── Hardware barcode scanner (USB / Bluetooth HID) ───────────────────────
  // These scanners "type" the barcode as a very fast burst of keystrokes ending
  // in Enter. We accumulate a fast burst and, on Enter, treat it as a scan - so
  // shops with a physical scanner work with NO setup, alongside the camera Scan
  // button (shops without a scanner just use the camera). Human typing is far
  // slower, so the >HID_GAP_MS gap resets the buffer; and we never intercept
  // while a text field is focused, so the search box / keypad are untouched.
  private hidBuffer = '';
  private hidLastTs = 0;
  private static readonly HID_GAP_MS = 60;
  private hidListener = (e: KeyboardEvent) => {
    const el = document.activeElement as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
    if (this.scanOpen()) return; // camera overlay is handling its own input
    const now = Date.now();
    if (now - this.hidLastTs > PosComponent.HID_GAP_MS) this.hidBuffer = '';
    this.hidLastTs = now;
    if (e.key === 'Enter') {
      const code = this.hidBuffer.trim();
      this.hidBuffer = '';
      if (code.length >= 3) { e.preventDefault(); this.handleScanValue(code); }
      return;
    }
    if (e.key.length === 1) this.hidBuffer += e.key; // a single printable char
  };

  // ── Cross-till stock sync ────────────────────────────────────────────────
  // Cheap: pulls ONLY id+stock+availability (see MenuItemService.getStock) so a
  // second till sees what the other sold, without re-downloading the menu.
  // Runs on a light interval while the till is open and immediately whenever
  // the app is brought to the foreground. Local per-sale decrements stay
  // authoritative between polls; a failed poll (offline) keeps current counts.
  private stockTimer: any = null;
  private static readonly STOCK_SYNC_MS = 20000;

  private startStockSync() {
    this.syncStock();
    this.stockTimer = setInterval(() => this.syncStock(), PosComponent.STOCK_SYNC_MS);
  }

  private syncStock() {
    this.service.getStock().subscribe({
      next: rows => {
        if (!rows?.length) return;
        const byId = new Map(rows.map(r => [r.id, r]));
        this.items = this.items.map(i => {
          const r = byId.get(i.id);
          return r ? { ...i, stockQuantity: r.stockQuantity, isAvailable: r.isAvailable } : i;
        });
      },
      error: () => { /* offline / transient - keep the counts we have */ },
    });
  }

  private load() {
    this.loading.set(true);
    this.service.getItems(true).subscribe(items => {
      this.items = items;
      this.loading.set(false);
      // The default category is a guess ('Hot Drinks'); snap to the first real
      // one so a shop without it never stares at an empty grid.
      const cats = this.categories;
      if (cats.length && !cats.includes(this.activeCat)) this.activeCat = cats[0];
    });
  }

  // Restore an in-flight cart after a crash/reload so no sale is lost mid-keystroke.
  private restoreCart() {
    try {
      const raw = sessionStorage.getItem(this.cartKey);
      if (raw) this.cart.set(JSON.parse(raw));
    } catch { /* corrupted or unavailable — start clean */ }
  }
  private checkShift() { this.service.getActiveShift(true).subscribe({ next: s => this.shiftActive.set(s.active), error: () => this.dialog.toast('Could not check shift status', 'error') }); }
  private loadShop() { this.service.getShopInfo(true).subscribe(s => this.shopInfo.set(s)); }

  // Native build version shown in the top bar / clock-in screen so cashiers
  // and the owner can always tell which build is running.
  readonly appVersion = signal('');

  private async loadAppVersion() {
    try {
      const { App } = await import('@capacitor/app');
      const info = await App.getInfo();
      const v = (info.version ?? '').trim();
      if (v) this.appVersion.set('v' + v);
    } catch { /* web build or no native info - label stays hidden */ }
  }

  // Re-check for updates when the app returns to the foreground (covers
  // opening the app from a release notification while it was backgrounded -
  // ngOnInit only runs on a cold start) and when an "update" notification is
  // tapped directly. Safe to re-run: the dismissed-version guard and the
  // version comparison keep it idempotent.
  private async listenForUpdateTriggers() {
    try {
      if (!Capacitor.isNativePlatform()) return;
      const { App } = await import('@capacitor/app');
      await App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) { void this.checkForUpdate(); this.syncStock(); }
      });
      const { PushNotifications } = await import('@capacitor/push-notifications');
      await PushNotifications.addListener('pushNotificationActionPerformed', (n) => {
        const data = (n.notification as any)?.data as Record<string, string> | undefined;
        if (data?.['type'] === 'update') void this.checkForUpdate();
      });
    } catch { /* push/updater unavailable - never block the app */ }
  }

  // In-app updater: compare our native version against the published release
  // and check in. The banner shows on the clock-in screen and as a slim bar
  // on the till, so a sale is never blocked. Required updates reappear on
  // every start; optional ones respect a per-version dismissal.
  // Returns true when a newer release exists (whether the banner was set).
  async checkForUpdate(): Promise<boolean> {
    try {
      const { App } = await import('@capacitor/app');
      const info = await App.getInfo();
      const current = (info.version ?? '').trim();
      if (!current) return false;
      return await new Promise<boolean>((resolve) => {
        this.service.getAppVersion().subscribe({
          next: (res) => {
            if (!res?.available) { resolve(false); return; }
            void this.service.checkinApp(current).subscribe({ error: () => {} });
            if (compareVersions(res.version, current) > 0) {
              const dismissed = localStorage.getItem('update_dismissed');
              if (dismissed !== res.version || res.isRequired) {
                this.updateInfo.set({ version: res.version, releaseNotes: res.releaseNotes ?? '', isRequired: res.isRequired });
                // Background pre-download (native): by the time the cashier
                // decides, it's usually already "Ready to install". Skip when a
                // download is already sitting ready.
                if (Capacitor.isNativePlatform() && this.updateState() !== 'ready') void this.downloadUpdate();
              }
              resolve(true);
            } else {
              resolve(false);
            }
          },
          error: () => resolve(false) // offline or API down - no banner
        });
      });
    } catch { /* web build or no native app info - skip */ return false; }
  }

  // Manual "Check for updates" (top-bar 📦 / clock-in link): ignores a
  // previous dismissal so an optional update is always findable again.
  async forceCheckForUpdate() {
    localStorage.removeItem('update_dismissed');
    this.updateBlocked.set(false);
    const found = await this.checkForUpdate();
    if (!found) this.dialog.toast('No update available — you are on the latest version', 'info');
  }

  // Download the update (with progress) or install the already-downloaded one.
  async downloadUpdate() {
    if (this.updateState() === 'downloading') return;
    this.updateBlocked.set(false);
    this.updateError.set('');
    this.updateState.set('downloading');
    this.updateProgress.set(0);
    const result = await this.updater.download(p => this.updateProgress.set(p));
    this.updateState.set(result === 'ready' ? 'ready' : 'failed');
    if (result !== 'ready') this.updateError.set('Download failed — check your connection and try again.');
  }

  async installUpdate() {
    if (this.updateState() !== 'ready') {
      await this.downloadUpdate();
      return;
    }
    const result = await this.updater.installDownloaded();
    if (result.ok) return;
    this.updateError.set(result.message || 'Install failed');
    if (result.blocked) {
      // System-level gate: user must allow unknown-source installs first.
      this.updateState.set('ready');
      this.updateBlocked.set(true);
      return;
    }
    this.updateState.set('failed');
  }

  // Open the system "Install unknown apps" screen for this app.
  openInstallSettings() {
    void this.updater.openInstallSettings().then(() => { /* user returns and taps Install */ });
  }

  dismissUpdate() {
    const v = this.updateInfo()?.version;
    if (v) localStorage.setItem('update_dismissed', v);
    this.updateInfo.set(null);
    this.updateState.set('idle');
    this.updateBlocked.set(false);
    this.updateError.set('');
  }

  startShift() {
    this.startingShift.set(true);
    const float = parseFloat(this.floatInput);
    this.service.startShift(Number.isFinite(float) && float > 0 ? float : 0).subscribe({
      next: () => { this.startingShift.set(false); this.shiftActive.set(true); },
      error: (e) => { this.startingShift.set(false); this.dialog.toast(e.error?.error || 'Could not start shift', 'error'); }
    });
  }

  // Handover: sign the current user out and drop the next cashier straight
  // into PIN sign-in, carrying the shop code so they never retype it.
  switchUser() {
    const code = this.auth.getShop()?.code;
    const qp: any = { pin: 1 };
    if (code) qp.shop = code;
    this.auth.logout()
      .pipe(finalize(() => this.router.navigate(['/login'], { queryParams: qp })))
      .subscribe();
  }

  endShift() {
    this.service.endShift().subscribe({
      next: () => {
        this.shiftActive.set(false);
        // Clock-out summary: what did this shift sell?
        this.service.getShiftSummary().subscribe({
          next: s => { this.shiftSummary.set(s); this.cashCounted = null; },
          error: () => this.shiftSummary.set(null)
        });
      },
      error: (e) => this.dialog.toast(e.error?.error || 'Could not end shift', 'error')
    });
  }

  addToCart(item: MenuItem) {
    // Sized / modifiable items open the configurator; plain items add instantly.
    if (item.sizes?.length || item.modifierGroups?.length) {
      const mods: Record<number, boolean> = {};
      this.configurator.set({ item, sizeId: item.sizes?.length ? item.sizes[0].id : null, mods, note: '' });
      return;
    }
    this.addLine(item.id, item.name, item.price, undefined, undefined, undefined, undefined);
  }

  // Barcode scanner: finds the item by SKU and adds it to the cart.
  // On the app this is the ONLY path: FastBarcodeScanner, our native
  // CameraX + ML Kit screen (instant, bundled model, no webview). If it fails
  // the user gets a clear toast - never a broken half-loaded webview overlay.
  // The html5-qrcode overlay below is used ONLY in a plain web browser (dev),
  // where its assets load fine; it never runs inside the native app.
  readonly scanning = signal(false);
  readonly scanOpen = signal(false);
  private htmlScanner: any = null;

  scanBarcode() {
    if (this.scanOpen() || this.scanning()) return;
    if (Capacitor.isNativePlatform()) {
      const fast = (Capacitor as any).Plugins?.FastBarcodeScanner;
      if (!fast) { this.dialog.toast('Scanner is unavailable on this build', 'error'); return; }
      this.scanning.set(true);
      fast.scan().then((res: any) => {
        this.scanning.set(false);
        this.handleScanValue(res?.ScanResult ?? '');
      }).catch((e: any) => {
        this.scanning.set(false);
        const msg = (e?.message ?? e?.code ?? '').toString();
        // SCAN_CANCELLED = user backed out / hit cancel: stay silent.
        if (!/cancel/i.test(msg)) {
          this.dialog.toast('Could not open the camera - check the camera permission and try again', 'error');
        }
      });
      return;
    }
    // Web/dev browser only.
    void this.scanJs();
  }

  private findBySku(sku: string): MenuItem | undefined {
    return this.items.find(i => (i as any).sku && (i as any).sku.toLowerCase() === sku.toLowerCase());
  }

  private handleScanValue(text: string) {
    const sku = (text ?? '').trim();
    if (!sku) { this.dialog.toast('No barcode detected', 'info'); return; }
    // A customer's loyalty QR encodes "LOY:<code>" — attach them for stamps
    // instead of treating it as a product barcode.
    if (/^LOY:/i.test(sku)) { this.attachLoyaltyByCode(sku.replace(/^LOY:/i, '')); return; }
    const item = this.findBySku(sku);
    if (item) { this.addToCart(item); this.dialog.toast(`${item.name} added`, 'success'); return; }
    // Miss on the in-memory catalog: the POS list is loaded once in ngOnInit
    // and has no live refresh, so a SKU just generated/edited in Admin (even on
    // this same device) isn't here yet. Refresh from the server and retry once
    // before giving up, so a freshly generated barcode scans without a restart.
    this.service.getItems().subscribe({
      next: items => {
        this.items = items;
        const again = this.findBySku(sku);
        if (again) { this.addToCart(again); this.dialog.toast(`${again.name} added`, 'success'); }
        else this.dialog.toast(`No item with barcode ${sku}`, 'error');
      },
      error: () => this.dialog.toast(`No item with barcode ${sku}`, 'error'),
    });
  }

  // JS engine fallback (html5-qrcode, works in the WebView when camera access
  // is granted; also the web path).
  private async scanJs() {
    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
      const scanner = new Html5Qrcode('pos-scanner-region', { formatsToSupport: [Html5QrcodeSupportedFormats.CODE_128], useBarCodeDetectorIfSupported: true, verbose: false });
      this.htmlScanner = scanner;
      this.scanOpen.set(true);
      this.scanning.set(true);
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 260, height: 140 } },
        (text: string) => void this.onScanResult(text),
        () => { /* keep scanning while no code is in frame */ },
      );
    } catch {
      this.scanOpen.set(false);
      this.scanning.set(false);
      this.dialog.toast('Could not start the camera in the browser', 'error');
    }
  }

  private async onScanResult(text: string) {
    try { await this.htmlScanner?.stop(); await this.htmlScanner?.clear(); } catch { /* ignore */ }
    this.htmlScanner = null;
    this.scanOpen.set(false);
    this.scanning.set(false);
    this.handleScanValue(text);
  }

  cancelScan() {
    if (this.htmlScanner) { void this.htmlScanner.stop().then(() => this.htmlScanner?.clear()).catch(() => {}); this.htmlScanner = null; }
    this.scanOpen.set(false);
    this.scanning.set(false);
  }


  cfgPickSize(cfg: { item: MenuItem; sizeId: number | null }, sizeId: number) {
    this.configurator.update(c => (c ? { ...c, sizeId } : c));
  }

  cfgToggleMod(cfg: { item: MenuItem; mods: Record<number, boolean> }, g: ModifierGroup, modId: number) {
    this.configurator.update(c => {
      if (!c) return c;
      const mods = { ...c.mods, [modId]: !c.mods[modId] };
      if (!g.isMulti) {
        for (const m of g.modifiers) if (m.id !== modId) mods[m.id] = false;
      }
      return { ...c, mods };
    });
  }

  cfgTotal(cfg: { item: MenuItem; sizeId: number | null; mods: Record<number, boolean> }): number {
    const size = cfg.item.sizes?.find(s => s.id === cfg.sizeId);
    const mods = (cfg.item.modifierGroups ?? []).flatMap(g => g.modifiers).filter(m => cfg.mods[m.id]);
    return (size?.price ?? cfg.item.price) + mods.reduce((s, m) => s + m.priceDelta, 0);
  }

  addConfig() {
    const cfg = this.configurator();
    if (!cfg) return;
    const size = cfg.item.sizes?.find(s => s.id === cfg.sizeId);
    const mods = (cfg.item.modifierGroups ?? [])
      .flatMap(g => g.modifiers.filter(m => cfg.mods[m.id]).map(m => ({ groupName: g.name, name: m.name, priceDelta: m.priceDelta })));
    this.addLine(
      cfg.item.id, cfg.item.name, this.cfgTotal(cfg),
      size?.id, size?.name, mods,
      cfg.note.trim() || undefined
    );
    this.configurator.set(null);
  }

  private addLine(id: number, name: string, price: number, sizeId?: number, sizeName?: string, modifiers?: CartItem['modifiers'], note?: string) {
    this.cart.update(c => {
      const exist = c.find(i => this.sameLine(i, { id, sizeId, modifiers, note }));
      const inCart = c.filter(i => i.id === id).reduce((s, i) => s + i.quantity, 0);
      if (inCart + 1 > this.stockOf(id)) return c; // can't add more than in stock
      return exist
        ? c.map(i => this.sameLine(i, { id, sizeId, modifiers, note }) ? { ...i, quantity: i.quantity + 1 } : i)
        : [...c, { id, name, price, quantity: 1, sizeId, sizeName, modifiers, note }];
    });
  }

  updateQty(ci: CartItem, delta: number) {
    this.cart.update(c => c.map(i => {
      if (!this.sameLine(i, ci)) return i;
      const max = this.stockOf(i.id);
      return { ...i, quantity: Math.min(Math.max(0, i.quantity + delta), max) };
    }).filter(i => i.quantity > 0));
  }

  // Two cart lines are the same product when item + size + modifiers + note match.
  private sameLine(a: CartItem, b: Partial<CartItem>): boolean {
    return a.id === b.id && (a.sizeId ?? null) === (b.sizeId ?? null)
      && (a.note ?? '') === (b.note ?? '')
      && (a.modifiers?.map(m => m.name).join('|') ?? '') === (b.modifiers?.map(m => m.name).join('|') ?? '');
  }

  lineKey(ci: CartItem): string {
    return `${ci.id}:${ci.sizeId ?? 0}:${(ci.modifiers?.map(m => m.name).join('|') ?? '')}:${ci.note ?? ''}`;
  }

  modSummary(ci: CartItem): string {
    return (ci.modifiers ?? []).map(m => m.priceDelta > 0 ? `${m.name} +R${m.priceDelta}` : m.name).join(' · ');
  }

  // ── Discounts / specials ──────────────────────────────

  private loadDiscounts() { this.service.getDiscounts(true).subscribe(ds => this.discounts.set(ds)); }

  liveDiscounts(): any[] { return this.discounts().filter(d => d.isLive); }

  discountAmount(): number {
    const d = this.selectedDiscount();
    if (!d) return 0;
    return d.type === 'percent' ? Math.round(this.total() * d.value) / 100 : Math.min(d.value, this.total());
  }

  netTotal(): number { return Math.max(0, this.total() - this.discountAmount()); }

  applyDiscount(d: any) { this.selectedDiscount.set(d); this.discountOpen.set(false); }

  // ── Till / payment ──────────────────────────────────────

  readonly received = () => parseFloat(this.receivedText()) || 0;
  readonly change = () => Math.max(0, this.received() - this.netTotal());
  readonly splitTotal = () => this.splitRows.reduce((s, r) => s + (r.amount || 0), 0);
  readonly canConfirm = () => {
    if (this.accountMode()) return this.accountCustomerId() != null;
    if (this.splitMode()) return Math.abs(this.splitTotal() - this.netTotal()) < 0.01;
    return this.payMethod() === 'card' || this.received() >= this.netTotal();
  };

  toNum(v: any): number { return parseFloat(v) || 0; }  pressKey(k: string) {
    if (k === '⌫') this.receivedText.update(t => t.slice(0, -1));
    else if (k === '.') {
      if (!this.receivedText().includes('.')) this.receivedText.update(t => (t ? t + '.' : '0.'));
    } else {
      // max 2 decimals
      const t = this.receivedText();
      if (t.includes('.')) {
        const dec = t.split('.')[1] ?? '';
        if (dec.length >= 2) return;
      }
      this.receivedText.update(t => t + k);
    }
  }

  setQuick(which: string) {
    // 'Exact' must use the DISCOUNTED total - charging pre-discount would
    // overcharge the customer and confuse the cashier.
    if (which === 'exact') this.receivedText.set(this.netTotal().toFixed(2));
    else this.receivedText.set(which);
  }
  addSplitRow() { this.splitRows = [...this.splitRows, { method: 'cash', amount: 0 }]; }
  removeSplitRow(i: number) { this.splitRows = this.splitRows.filter((_, idx) => idx !== i); }

  // House-account: search the customer directory while the sheet is open.
  searchCustomers() {
    const q = this.custSearch().trim();
    if (q.length < 2) { this.custResults.set([]); return; }
    this.service.getCustomers(q).subscribe(c => this.custResults.set(c.slice(0, 6)));
  }

  pickAccountCustomer(c: any) {
    this.accountCustomerId.set(c.id);
    this.accountCustomerName.set(c.name);
    this.custResults.set([]);
    this.custSearch.set('');
  }

  // Loyalty customer attach (optional, non-account sales).
  searchLoyalty() {
    const q = this.loySearch().trim();
    if (q.length < 2) { this.loyResults.set([]); return; }
    // Cashier-accessible minimal lookup (phone / name), unlike the admin-only
    // customer directory.
    this.service.loyaltyLookup(q).subscribe(c => this.loyResults.set((c ?? []).slice(0, 6)));
  }
  pickLoyaltyCust(c: any) {
    this.loyaltyCust.set(c);
    this.loyResults.set([]);
    this.loySearch.set('');
    this.loyaltyRedeem.set(false);
  }
  clearLoyaltyCust() {
    this.loyaltyCust.set(null);
    this.loyaltyRedeem.set(false);
  }
  // Attach a loyalty customer from a scanned personal QR (LOY:<code>).
  private attachLoyaltyByCode(code: string) {
    this.service.loyaltyLookup(code.trim()).subscribe({
      next: list => {
        const c = (list ?? [])[0];
        if (!c) { this.dialog.toast('No loyalty customer for that code', 'error'); return; }
        this.loyaltyCust.set(c);
        this.dialog.toast(`Loyalty: ${c.name} attached — ${c.loyaltyStamps} stamp${c.loyaltyStamps === 1 ? '' : 's'}`, 'success');
      },
      error: () => this.dialog.toast('Could not look up that loyalty code', 'error'),
    });
  }

  // Checkout button: open the payment sheet instead of charging blindly.
  checkout() {
    if (this.cart().length === 0) return;
    this.payMethod.set('cash');
    this.receivedText.set('');
    this.dineMode.set('takeaway');
    this.tableNumber.set('');
    this.splitMode.set(false);
    this.splitRows = [];
    this.accountMode.set(false);
    this.accountCustomerId.set(null);
    this.accountCustomerName.set('');
    this.custSearch.set('');
    this.custResults.set([]);
    this.paymentOpen.set(true);
  }

  confirmPayment() {
    if (!this.canConfirm() || this.busy()) return;
    this.busy.set(true);

    // Build the tender list: account charge / split rows / single method.
    // Cash rows carry what was ACTUALLY tendered (may overpay - the server
    // computes change); card/account rows are exact.
    const payments: { method: string; amount: number }[] = [];
    if (this.accountMode()) {
      payments.push({ method: 'account', amount: Math.round(this.netTotal() * 100) / 100 });
    } else if (this.splitMode()) {
      this.splitRows.forEach(r => { if ((r.amount || 0) > 0) payments.push({ method: r.method, amount: Math.round(r.amount * 100) / 100 }); });
    } else if (this.payMethod() === 'cash') {
      payments.push({ method: 'cash', amount: this.received() > 0 ? Math.round(this.received() * 100) / 100 : Math.round(this.netTotal() * 100) / 100 });
    } else {
      payments.push({ method: 'card', amount: Math.round(this.netTotal() * 100) / 100 });
    }

    this.service.placeOrder(this.cart(), {
      method: this.accountMode() ? 'card' : this.payMethod(),
      amountReceived: this.payMethod() === 'cash' && !this.accountMode() ? this.received() : null,
      payments,
      accountCustomerId: this.accountMode() ? this.accountCustomerId() : null,
      // Loyalty: the account customer (if any) earns; otherwise the optionally
      // attached loyalty customer earns/redeems. Redeem only on the loyalty path.
      loyaltyCustomerId: this.accountMode() ? this.accountCustomerId() : (this.loyaltyCust()?.id ?? null),
      redeemLoyalty: !this.accountMode() && this.loyaltyRedeem(),
      dineMode: this.dineMode(),
      tableNumber: this.tableNumber().trim() || null
    }, this.selectedDiscount()?.id ?? null, {
      // Snapshot used to build the local receipt when the order is queued offline.
      id: `LOC-${Date.now()}`,
      total: this.netTotal(),
      discountAmount: Math.max(0, this.total() - this.netTotal()),
      discountName: this.selectedDiscount()?.name ?? null,
      amountReceived: this.payMethod() === 'cash' ? this.received() : null,
      changeGiven: this.payMethod() === 'cash' ? Math.max(0, this.received() - this.netTotal()) : null
    }).subscribe({
      next: (order) => {
        this.busy.set(false);
        this.paymentOpen.set(false);
        const sold = this.cart();
        this.cart.set([]);
        this.selectedDiscount.set(null);
        // Update stock locally instead of re-fetching the ENTIRE menu after
        // every sale - that GET is heavy and rewrites the whole offline cache,
        // which is what made the till feel slow between customers.
        this.applyLocalStock(sold);
        this.lastOrder.set(order);
        this.lastReceipt.set(order);
        this.sound.orderComplete();
        // Loyalty feedback for the cashier (server already updated the balance).
        const lc = this.loyaltyCust();
        if (this.shopInfo()?.loyaltyEnabled && lc && !this.accountMode()) {
          const req = this.shopInfo()?.loyaltyStampsRequired ?? 10;
          if (this.loyaltyRedeem() && (lc.loyaltyStamps ?? 0) >= req) {
            this.dialog.toast(`Reward redeemed for ${lc.name} — ${this.shopInfo()?.loyaltyReward ?? 'reward'}`, 'success');
          } else {
            const now = (lc.loyaltyStamps ?? 0) + 1;
            this.dialog.toast(`Loyalty: ${lc.name} now has ${now}/${req} stamp${now === 1 ? '' : 's'}${now >= req ? ' — reward ready!' : ''}`, 'success');
          }
        }
        this.clearLoyaltyCust();
        this.pingKitchen(order.id, order.items);
      },
      error: (e) => {
        this.busy.set(false);
        this.dialog.toast(this.apiError(e) || 'Checkout failed', 'error');
        // No reload: a failed checkout changed nothing, so the menu/stock we
        // already have is still correct.
      }
    });
  }

  // Kitchen display webhook: ping the kitchen tablet's local server over the
  // shop WiFi (instant + free + zero FCM). Carries a short item summary so the
  // kitchen can show "pending sync" cards when the cloud is unreachable.
  // Fail-soft - if the kitchen is unreachable it picks the order up on its
  // fallback poll.
  private pingKitchen(orderId: number | string, items?: any[]) {
    // Multiple displays are supported: the setting can hold several kitchen
    // URLs (comma-separated) - e.g. one for the kitchen, one for the bar.
    const urls = (this.shopInfo()?.kitchenUrl ?? '')
      .split(',')
      .map((u: string) => u.trim())
      .filter((u: string) => u.length > 0);
    if (urls.length === 0) return;
    const summary = (items ?? [])
      .map((i: any) => `${i.quantity}A-${i.name}`)
      .join(', ')
      .slice(0, 200);
    void import('@capacitor/core').then(({ CapacitorHttp }) =>
      Promise.allSettled(urls.map((url: string) =>
        CapacitorHttp.get({
          url: `${url.replace(/\/+$/, '')}/order?id=${encodeURIComponent(orderId)}&s=${encodeURIComponent(summary)}`,
          connectTimeout: 2000,
          readTimeout: 2000
        }).catch(() => { /* kitchen offline - fallback poll covers it */ })
      ))
    );
  }

  closeReceipt() { this.lastOrder.set(null); this.showComplete(); }

  // One-tap reprint of the last receipt (customer asks for a copy).
  reprintLast() {
    if (!this.lastReceipt()) { this.dialog.toast('No receipt yet', 'info'); return; }
    this.lastOrder.set(this.lastReceipt());
  }

  // Print the current receipt: native app uses the Android print framework
  // (any printer the device can reach, incl. Bluetooth thermal with a print
  // service); web falls back to the system print dialog.
  printReceipt() {
    const el = this.receiptBox?.nativeElement?.querySelector('.receipt-print') as HTMLElement | null;
    if (!el) { this.dialog.toast('Receipt not ready', 'error'); return; }
    void this.printer.printReceiptHtml(el.outerHTML).then(ok => {
      if (!ok) { this.dialog.toast('No printer available - opening system print', 'error'); window.print(); }
    });
  }

  // Kitchen ticket: items + modifiers + notes ONLY (no prices/customer/VAT),
  // big monospace type so the bar can read it across the counter.
  printTicket() {
    const o = this.lastOrder();
    if (!o) return;
    const rows = (o.items ?? []).map((i: any) => {
      const size = i.sizeName ? ` (${i.sizeName})` : '';
      const mods = (i.modifiers ?? []).map((m: any) => m.name).filter((n: string) => !!n).join(', ');
      const note = i.note ? ` — ${i.note}` : '';
      return `<div style="margin-bottom:6px"><span style="font-weight:bold">${i.quantity}×</span> <strong>${this.esc(i.name)}${this.esc(size)}</strong>`
        + (mods ? `<div style="margin-left:1.2em;color:#333">+ ${this.esc(mods)}</div>` : '')
        + (note ? `<div style="margin-left:1.2em;color:#333">${this.esc(note)}</div>` : '') + '</div>';
    }).join('');
    const html = `<div style="font-family:monospace;font-size:18px;max-width:300px;color:#000">
      <div style="text-align:center;font-weight:bold;font-size:22px;border-bottom:2px dashed #000;padding-bottom:6px;margin-bottom:8px">KITCHEN TICKET</div>
      <div>Order #${o.id} &nbsp; ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
      <div style="border-bottom:1px dashed #000;margin:6px 0 8px"></div>
      ${rows}
      <div style="border-top:2px dashed #000;margin-top:10px;padding-top:6px;text-align:center">***</div>
    </div>`;
    void this.printer.printReceiptHtml(html).then(ok => {
      if (!ok) { this.dialog.toast('No printer available - opening system print', 'error'); window.print(); }
    });
  }

  private esc(s: any): string {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Brief success moment, then straight back to a clean POS.
  private showComplete() {
    this.complete.set(true);
    setTimeout(() => this.complete.set(false), 1600);
  }
}
