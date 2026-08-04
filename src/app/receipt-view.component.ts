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
  template: `
    <div class="receipt-print receipt">
      <div class="r-head">
        @if (shop?.logoUrl) { <img [src]="shop.logoUrl" alt="" class="r-logo" /> }
        <strong class="r-shop">{{ shop?.name || 'CoffeeShop Pro' }}</strong>
        @if (shop?.code) { <span class="r-sub">{{ shop.code }}</span> }
      </div>
      <div class="r-meta">
        <span>Order #{{ order.id }}</span>
        <span>{{ order.createdAt | date:'medium' }}</span>
        <span>Cashier: {{ cashierName || '—' }}</span>
      </div>
      <div class="r-items">
        @for (line of order.items; track line.id) {
          <div class="r-line">
            <span>{{ line.quantity }} × {{ line.name }}{{ line.sizeName ? ' (' + line.sizeName + ')' : '' }}</span>
            <span>R{{ (line.price * line.quantity) | number:'1.2-2' }}</span>
          </div>
        }
      </div>
      @if (order.discountAmount > 0) {
        <div class="r-disc"><span>Discount ({{ order.discountName }})</span><span>−R{{ order.discountAmount | number:'1.2-2' }}</span></div>
      }
      <div class="r-total"><span>Total</span><strong>R{{ order.total | number:'1.2-2' }}</strong></div>
      <div class="r-pay">
        <span>Paid: {{ order.paymentMethod === 'cash' ? 'Cash' : 'Card' }}</span>
        @if (order.paymentMethod === 'cash') {
          <span>Received: R{{ order.amountReceived | number:'1.2-2' }}</span>
          <span>Change: R{{ order.changeGiven | number:'1.2-2' }}</span>
        }
      </div>
      <p class="r-thanks">Thank you! ☕</p>
      @if (qrDataUrl) {
        <div class="r-qr">
          <img [src]="qrDataUrl" alt="Receipt QR" />
          <span class="r-qr-sub">Scan me</span>
        </div>
      }
    </div>
    <button class="r-print-btn" (click)="print()">🖨 Print</button>
  `,
  styles: [`
    .receipt {
      width: 300px;
      margin: 0 auto;
      background: #fdfdf7;
      color: #111;
      border-radius: 12px;
      padding: 1.5rem 1.25rem;
      font-family: 'Courier New', monospace;
      box-shadow: var(--shadow-md);
    }
    .r-head { text-align: center; margin-bottom: 0.9rem; }
    .r-logo { width: 48px; height: 48px; border-radius: 10px; object-fit: cover; display: block; margin: 0 auto 0.4rem; }
    .r-shop { display: block; font-size: 1.05rem; }
    .r-sub { font-size: 0.7rem; opacity: 0.6; }
    .r-meta { display: flex; flex-direction: column; gap: 0.15rem; font-size: 0.72rem; opacity: 0.75; border-top: 1px dashed #999; border-bottom: 1px dashed #999; padding: 0.5rem 0; margin-bottom: 0.5rem; }
    .r-items { font-size: 0.8rem; }
    .r-line { display: flex; justify-content: space-between; gap: 1rem; padding: 0.18rem 0; }
    .r-line span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .r-total { display: flex; justify-content: space-between; border-top: 1px dashed #999; margin-top: 0.4rem; padding-top: 0.5rem; font-size: 0.95rem; }
    .r-disc { display: flex; justify-content: space-between; font-size: 0.78rem; padding: 0.2rem 0; }
    .r-qr { display: flex; flex-direction: column; align-items: center; gap: 0.3rem; margin-top: 0.9rem; padding-top: 0.7rem; border-top: 1px dashed #999; }
    .r-qr img { width: 132px; height: 132px; border-radius: 6px; }
    .r-qr-sub { font-size: 0.65rem; opacity: 0.6; }
    .r-pay { display: flex; flex-direction: column; gap: 0.15rem; font-size: 0.72rem; opacity: 0.8; margin-top: 0.5rem; }
    .r-thanks { text-align: center; margin: 0.8rem 0 0; font-size: 0.75rem; }
    .r-print-btn {
      display: block;
      margin: 1rem auto 0;
      padding: 0.6rem 1.6rem;
      border: 0;
      border-radius: var(--radius-sm);
      background: var(--accent);
      color: #fff;
      font-family: inherit;
      font-size: 0.875rem;
      font-weight: 700;
      cursor: pointer;
    }
    .r-print-btn:hover { background: var(--accent-hover); }
    /* Screen-only: hide the print button on paper */
    @media print { .r-print-btn { display: none; } }
  `]
})
export class ReceiptViewComponent implements OnInit {
  @Input() order: any = null;
  @Input() shop: any = null;
  @Input() cashierName = '';

  qrDataUrl: string | null = null;

  ngOnInit() { this.renderQr(); }

  print() { window.print(); }

  // QR is generated CLIENT-SIDE (qrcode lib, pure JS) — zero backend load.
  // The QR carries the shop's configured receipt link (WhatsApp / review /
  // feedback). No link configured = no QR: a QR that just repeats the printed
  // text is noise.
  private renderQr() {
    if (!this.order) return;
    const url = this.shop?.receiptQrUrl?.trim();
    if (!url) { this.qrDataUrl = null; return; }
    // Be forgiving: "wa.me/2782..." without a scheme still scans as a link.
    const target = /^https?:\/\//i.test(url) ? url : 'https://' + url;
    QRCode.toDataURL(target, { width: 132, margin: 1, color: { dark: '#111111', light: '#fdfdf7' } })
      .then(dataUrl => this.qrDataUrl = dataUrl)
      .catch(() => this.qrDataUrl = null);
  }
}
