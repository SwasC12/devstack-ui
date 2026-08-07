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

  ngOnInit() { this.renderQr(); }

  modText(line: any): string {
    return (line.modifiers ?? []).map((m: any) => m.priceDelta > 0 ? `${m.name} +R${m.priceDelta}` : m.name).join(', ');
  }

  vatOf(order: any): number {
    return Math.round(Number(order.total) * 15 / 115 * 100) / 100;
  }

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
