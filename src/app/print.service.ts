import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';

// Receipt printing. Native app: prints via the Android print framework
// (@capgo/capacitor-printer -> PrintManager), which reaches any printer the
// device can print to - including Bluetooth thermal printers that expose a
// print service. Web: returns false so the caller falls back to window.print().
@Injectable({ providedIn: 'root' })
export class PrintService {
  async printReceiptHtml(html: string): Promise<boolean> {
    if (Capacitor.isNativePlatform()) {
      try {
        const { Printer } = await import('@capgo/capacitor-printer');
        const bytes = new TextEncoder().encode(html);
        let bin = '';
        for (const b of bytes) bin += String.fromCharCode(b);
        await Printer.printBase64({
          name: 'Receipt',
          data: btoa(bin),
          mimeType: 'text/html',
        });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}
