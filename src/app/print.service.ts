import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';

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
}
