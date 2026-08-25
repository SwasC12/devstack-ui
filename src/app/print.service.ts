import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

export interface BtDevice { name: string; address: string; }
const BT_PRINTER_KEY = 'pos_bt_printer';

// Central printing service. Handles anything the app prints - receipts, kitchen
// tickets, barcode labels, and the admin analytics report - through one path.
//
// Native app: prints via the Android print framework (@capgo/capacitor-printer
// -> PrintManager), which reaches any printer the device can print to (incl.
// Bluetooth thermal printers) AND offers the built-in "Save as PDF" target, so
// the analytics report can be saved without any separate PDF library.
//
// Web: prints the given HTML in an isolated hidden iframe (NOT window.print(),
// which would print the whole SPA). The browser's print dialog likewise offers
// "Save as PDF".
@Injectable({ providedIn: 'root' })
export class PrintService {
  // Print an arbitrary HTML document. jobName labels the print job / suggested
  // file name. Returns true if the print pipeline was reached.
  async printHtml(html: string, jobName = 'Document'): Promise<boolean> {
    if (Capacitor.isNativePlatform()) {
      try {
        const { Printer } = await import('@capgo/capacitor-printer');
        // UTF-8 safe base64 (handles non-ASCII in item names, notes, etc.).
        const bytes = new TextEncoder().encode(html);
        let bin = '';
        for (const b of bytes) bin += String.fromCharCode(b);
        await Printer.printBase64({ name: jobName, data: btoa(bin), mimeType: 'text/html' });
        return true;
      } catch {
        return false;
      }
    }
    return this.printHtmlViaIframe(html);
  }

  // Backwards-compatible alias used by the receipt/ticket/label call sites.
  async printReceiptHtml(html: string): Promise<boolean> {
    return this.printHtml(html, 'Receipt');
  }

  // Web fallback: render the HTML into an off-screen iframe and print just that
  // document, so the surrounding app UI is never part of the printout.
  private printHtmlViaIframe(html: string): boolean {
    try {
      const frame = document.createElement('iframe');
      frame.setAttribute('aria-hidden', 'true');
      Object.assign(frame.style, {
        position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0',
      } as CSSStyleDeclaration);
      document.body.appendChild(frame);
      const win = frame.contentWindow;
      if (!win) { frame.remove(); return false; }
      win.document.open();
      win.document.write(html);
      win.document.close();
      const cleanup = () => setTimeout(() => frame.remove(), 1000);
      win.onafterprint = cleanup;
      // Give the iframe a tick to lay out (and decode any inline images).
      setTimeout(() => { try { win.focus(); win.print(); } catch { /* ignore */ } cleanup(); }, 300);
      return true;
    } catch {
      return false;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Bluetooth thermal (ESC/POS) printing — Epson TM (ESC/POS mode) + generic
  // 58/80mm SPP printers. The printer is paired once in Android settings; we
  // list bonded devices, save the chosen one, and send ESC/POS bytes.
  // ══════════════════════════════════════════════════════════════════════════

  private get bt(): any { return (Capacitor as any).Plugins?.BtPrinter; }
  get btAvailable(): boolean { return Capacitor.isNativePlatform() && !!this.bt; }

  async getBtPrinter(): Promise<BtDevice | null> {
    try { const { value } = await Preferences.get({ key: BT_PRINTER_KEY }); return value ? JSON.parse(value) : null; }
    catch { return null; }
  }
  async saveBtPrinter(d: BtDevice | null): Promise<void> {
    if (d) await Preferences.set({ key: BT_PRINTER_KEY, value: JSON.stringify(d) });
    else await Preferences.remove({ key: BT_PRINTER_KEY });
  }
  // Paired Bluetooth devices to choose the printer from. Throws with a message
  // (permission / BT off) the caller can surface.
  async listBtPrinters(): Promise<BtDevice[]> {
    if (!this.btAvailable) throw new Error('Bluetooth printing is only available in the app.');
    const res = await this.bt.listDevices();
    return (res?.devices ?? []) as BtDevice[];
  }

  // Print a receipt to the configured BT printer. Returns 'no-printer' when
  // none is set (caller should fall back to the normal print), 'ok', or 'error'.
  async printReceiptToBt(order: any, shop: any, cashierName: string): Promise<'ok' | 'error' | 'no-printer'> {
    if (!this.btAvailable) return 'no-printer';
    const printer = await this.getBtPrinter();
    if (!printer?.address) return 'no-printer';
    try {
      const bytes = this.buildReceiptEscPos(order, shop, cashierName);
      await this.bt.print({ address: printer.address, data: this.toBase64(bytes) });
      return 'ok';
    } catch { return 'error'; }
  }

  // Small self-test print so the user can confirm a newly-paired printer works.
  async testPrint(address: string): Promise<void> {
    const e = new EscPos();
    e.init().align('center').bold(true).size(2).text('Test print').size(1).bold(false).feed()
      .text('CoffeeShop Pro').feed()
      .text('Your printer is connected.')
      .feed(3).cut();
    await this.bt.print({ address, data: this.toBase64(e.bytes()) });
  }

  // Build the receipt as ESC/POS bytes, honouring the shop's receipt settings
  // (header/footer + show VAT/cashier/QR). 32-column layout (58mm; also fine on
  // 80mm). Currency + item math mirror the on-screen receipt.
  private buildReceiptEscPos(order: any, shop: any, cashierName: string): number[] {
    const W = 32;
    const money = (v: any) => 'R' + (Number(v) || 0).toFixed(2);
    const e = new EscPos();
    e.init().align('center').bold(true).size(2).text(shop?.name || 'CoffeeShop Pro').size(1).bold(false);
    if (shop?.code) e.text(shop.code);
    if (shop?.receiptHeader) e.text(shop.receiptHeader);
    e.feed().align('left');
    e.text(`Order #${order.id}`);
    e.text(this.fmtDate(order.createdAt));
    if (shop?.receiptShowCashier !== false) e.text(`Cashier: ${cashierName || '-'}`);
    if (order.dineMode === 'dinein' || order.tableNumber) {
      e.text((order.dineMode === 'dinein' ? 'Dine-in' : 'Takeaway') + (order.tableNumber ? ` - Table ${order.tableNumber}` : ''));
    }
    e.rule(W);
    let itemCount = 0;
    for (const line of (order.items ?? [])) {
      itemCount += line.quantity ?? 0;
      e.row(`${line.quantity} x ${line.name}`, money(line.price * line.quantity), W);
      const mods = (line.modifiers ?? []).map((m: any) => m.priceDelta > 0 ? `${m.name} +R${m.priceDelta}` : m.name).join(', ');
      const sub = [line.sizeName, mods].filter(Boolean).join(' · ');
      if (sub) e.text('   ' + sub);
      if (line.note) e.text('   Note: ' + line.note);
    }
    e.rule(W);
    // Totals: subtotal (before discount) → adjustments → TOTAL → incl. VAT.
    const discount = order.discountAmount || 0;
    const svc = order.serviceChargeAmount || 0;
    const tip = order.tipAmount || 0;
    const grand = (order.total || 0) + svc + tip;
    e.row(`Subtotal (${itemCount} item${itemCount === 1 ? '' : 's'})`, money((order.total || 0) + discount), W);
    if (discount > 0) e.row('Discount', '-' + money(discount), W);
    if (svc > 0) e.row('Service charge', money(svc), W);
    if (tip > 0) e.row('Tip', money(tip), W);
    e.bold(true).row('TOTAL', money(grand), W).bold(false);
    if (shop?.receiptShowVat !== false) {
      const vat = Math.round(grand * 15 / 115 * 100) / 100;
      if (vat > 0) e.row('Incl. VAT (15%)', money(vat), W);
    }
    e.rule(W);
    // Payment summary
    const cap = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
    if ((order.payments?.length ?? 0) > 1) {
      e.text('Payment: ' + order.payments.map((p: any) => `${cap(p.method)} ${money(p.amount)}`).join(' + '));
    } else {
      const m = order.paymentMethod === 'account' ? 'Account' : (order.paymentMethod === 'cash' ? 'Cash' : 'Card');
      e.text('Payment: ' + m);
    }
    if (order.amountReceived != null) e.row('Cash received', money(order.amountReceived), W);
    if (order.changeGiven != null) e.row('Change', money(order.changeGiven), W);
    e.rule(W);
    e.align('center').text(shop?.receiptFooter || 'Thank you - see you again soon!');
    if (shop?.receiptShowQr !== false && shop?.receiptQrUrl) {
      const url = /^https?:\/\//i.test(shop.receiptQrUrl) ? shop.receiptQrUrl : 'https://' + shop.receiptQrUrl;
      e.feed().qr(url).text('Scan for more');
    }
    // Order barcode (Code128) like a real till receipt.
    e.feed().barcode128(String(order.id));
    e.feed().text('Powered by CoffeeShop Pro');
    e.feed(3).cut();
    return e.bytes();
  }

  private fmtDate(v: any): string { try { return new Date(v).toLocaleString(); } catch { return ''; } }

  private toBase64(bytes: number[]): string {
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b & 0xff);
    return btoa(bin);
  }
}

// Minimal ESC/POS command builder (bytes). Chainable. Text is encoded as
// Latin-1 (thermal printers use CP437/CP1252 for the ASCII range we emit).
class EscPos {
  private buf: number[] = [];
  private push(...b: number[]) { for (const x of b) this.buf.push(x & 0xff); return this; }
  private raw(s: string) { for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); this.buf.push(c > 255 ? 0x3f : c); } return this; }
  init() { return this.push(0x1b, 0x40); }
  align(a: 'left' | 'center' | 'right') { return this.push(0x1b, 0x61, a === 'center' ? 1 : a === 'right' ? 2 : 0); }
  bold(on: boolean) { return this.push(0x1b, 0x45, on ? 1 : 0); }
  size(n: 1 | 2) { return this.push(0x1d, 0x21, n === 2 ? 0x11 : 0x00); } // double or normal
  text(s: string) { return this.raw(s).push(0x0a); }
  feed(n = 1) { for (let i = 0; i < n; i++) this.push(0x0a); return this; }
  rule(w: number) { return this.text('-'.repeat(w)); }
  // Left text + right-aligned value on one W-char line (truncates a long left).
  row(left: string, right: string, w: number) {
    const r = right ?? '';
    const maxLeft = Math.max(0, w - r.length - 1);
    let l = left ?? '';
    if (l.length > maxLeft) l = l.slice(0, maxLeft);
    const pad = Math.max(1, w - l.length - r.length);
    return this.text(l + ' '.repeat(pad) + r);
  }
  // QR code via the standard GS ( k command set (Epson + most modern generics).
  qr(data: string) {
    const store = (s: string) => {
      const bytes: number[] = []; for (let i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i) & 0xff);
      const len = bytes.length + 3; this.push(0x1d, 0x28, 0x6b, len & 0xff, (len >> 8) & 0xff, 0x31, 0x50, 0x30, ...bytes);
    };
    this.align('center');
    this.push(0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00); // model 2
    this.push(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06);       // module size 6
    this.push(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31);       // error correction M
    store(data);
    this.push(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30);       // print
    return this;
  }
  // Code128 barcode via GS k (function B: length-prefixed). Prepends "{B" to
  // select code set B (ASCII). HRI text printed below. Centred by the caller.
  barcode128(data: string) {
    const payload = '{B' + data;
    const bytes: number[] = []; for (let i = 0; i < payload.length; i++) bytes.push(payload.charCodeAt(i) & 0xff);
    this.push(0x1d, 0x68, 0x50);       // GS h 80 — barcode height
    this.push(0x1d, 0x77, 0x02);       // GS w 2  — module width
    this.push(0x1d, 0x48, 0x02);       // GS H 2  — HRI text below the barcode
    this.push(0x1d, 0x66, 0x00);       // GS f 0  — HRI font A
    this.push(0x1d, 0x6b, 0x49, (bytes.length) & 0xff, ...bytes); // GS k 73 (CODE128) n data
    return this;
  }
  cut() { return this.push(0x1d, 0x56, 0x01); } // partial cut (ignored by cutterless printers)
  bytes(): number[] { return this.buf; }
}
