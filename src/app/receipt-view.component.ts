import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as QRCode from 'qrcode';

// Reusable receipt: thermal-paper style, print-ready (the whole receipt is a
// .receipt-print element, isolated by the global @media print rules). Used by
// the POS after checkout and by the admin Orders tab for reprints.
@Component({
  selector: 'app-receipt',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './receipt-view.component.html',
  styleUrl: './receipt-view.component.scss',
})
export class ReceiptViewComponent implements OnInit {
  @Input() order: any = null;
  @Input() shop: any = null;
  @Input() cashierName = '';

  qrDataUrl: string | null = null;
  barcodeDataUrl: string | null = null;

  ngOnInit() { this.renderQr(); void this.renderBarcode(); }

  // Code128 barcode of the order number (like a real till receipt), rendered
  // client-side with JsBarcode. Best-effort: no barcode if the lib/order is
  // unavailable.
  private async renderBarcode() {
    if (!this.order?.id) return;
    try {
      const mod: any = await import('jsbarcode');
      const JsBarcode = mod.default ?? mod;
      const canvas = document.createElement('canvas');
      JsBarcode(canvas, String(this.order.id), {
        format: 'CODE128', width: 2, height: 48, displayValue: true,
        fontSize: 13, margin: 0, background: '#fdfdf7', lineColor: '#111111',
      });
      this.barcodeDataUrl = canvas.toDataURL('image/png');
    } catch { this.barcodeDataUrl = null; }
  }

  modText(line: any): string {
    return (line.modifiers ?? []).map((m: any) => m.priceDelta > 0 ? `${m.name} +R${m.priceDelta}` : m.name).join(', ');
  }

  titlecase(s: string): string {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  // Total quantity across all lines (for the "N items" subtotal label).
  itemCount(): number {
    return (this.order?.items ?? []).reduce((n: number, l: any) => n + (l.quantity ?? 0), 0);
  }

  // Items subtotal BEFORE discount (order.total is already net of discount).
  subtotal(): number {
    return Math.round(((Number(this.order?.total) || 0) + (Number(this.order?.discountAmount) || 0)) * 100) / 100;
  }

  // Grand total actually charged: net items + service charge + tip.
  grandTotal(): number {
    const o = this.order ?? {};
    return Math.round(((Number(o.total) || 0) + (Number(o.serviceChargeAmount) || 0) + (Number(o.tipAmount) || 0)) * 100) / 100;
  }

  // VAT is computed on the grand total (VAT-inclusive pricing).
  vatOf(order: any): number {
    return Math.round(this.grandTotal() * 15 / 115 * 100) / 100;
  }

  hasCashPayment(order: any): boolean {
    return (order.payments ?? []).some((p: any) => p.method === 'cash');
  }

  // QR is generated CLIENT-SIDE (qrcode lib, pure JS) — zero backend load.
  // The QR carries the shop's configured receipt link (WhatsApp / review /
  // feedback). No link configured = no QR: a QR that just repeats the printed
  // text is noise.
  private renderQr() {
    if (!this.order) return;
    if (this.shop?.receiptShowQr === false) { this.qrDataUrl = null; return; }
    const url = this.shop?.receiptQrUrl?.trim();
    if (!url) { this.qrDataUrl = null; return; }
    // Be forgiving: "wa.me/2782..." without a scheme still scans as a link.
    const target = /^https?:\/\//i.test(url) ? url : 'https://' + url;
    QRCode.toDataURL(target, { width: 132, margin: 1, color: { dark: '#111111', light: '#fdfdf7' } })
      .then(dataUrl => this.qrDataUrl = dataUrl)
      .catch(() => this.qrDataUrl = null);
  }
}
