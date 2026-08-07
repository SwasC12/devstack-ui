import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { AuthService } from './auth.service';
import { environment } from '../environments/environment';

// In-app updater downloader. Streams the current APK from the API (JWT
// attached), saves it to the app cache, and hands it to the native
// InstallApk plugin, which opens Android's package installer via FileProvider.
// Web builds have no installer - download() still works, install() returns
// false.
@Injectable({ providedIn: 'root' })
export class UpdaterService {
  private auth = inject(AuthService);
  private readonly fileName = 'coffeeshoppro-update.apk';

  private installer(): any {
    return (Capacitor as any).Plugins?.InstallApk ?? null;
  }

  // Download the current APK with progress (0..1). Returns 'ready' once the
  // file is saved, 'failed' on any error.
  async download(onProgress: (fraction: number) => void): Promise<'ready' | 'failed'> {
    try {
      const token = this.auth.token;
      if (!token) return 'failed';

      const res = await fetch(`${environment.apiBase}/app/download`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return 'failed';

      const total = Number(res.headers.get('content-length') ?? 0);
      const reader = res.body?.getReader();
      if (!reader) return 'failed';

      const chunks: Uint8Array[] = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (total > 0) onProgress(received / total);
      }
      onProgress(1);

      const blob = new Blob(chunks, { type: 'application/vnd.android.package-archive' });
      const base64 = await blobToBase64(blob);
      await Filesystem.writeFile({ path: this.fileName, data: base64, directory: Directory.Cache });
      return 'ready';
    } catch {
      return 'failed';
    }
  }

  // Launch Android's package installer for the downloaded APK. False on web
  // or when the native plugin/file is missing.
  async installDownloaded(): Promise<boolean> {
    try {
      if (!Capacitor.isNativePlatform()) return false;
      const plugin = this.installer();
      if (!plugin) return false;
      const uri = await Filesystem.getUri({ path: this.fileName, directory: Directory.Cache });
      await plugin.install({ filePath: uri.uri });
      return true;
    } catch {
      return false;
    }
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1] ?? '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
