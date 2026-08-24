import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { AuthService } from './auth.service';
import { environment } from '../environments/environment';

// In-app updater downloader. Streams the current APK from the API (JWT
// attached), saves it to the app cache, and hands it to the native
// InstallApk plugin, which opens Android's package installer via FileProvider.
// Uses fetch with keepalive to improve download resilience during brief
// backgrounding. Web builds have no installer - download() still works,
// install() returns false.
@Injectable({ providedIn: 'root' })
export class UpdaterService {
  private auth = inject(AuthService);
  private readonly fileName = 'coffeeshoppro-update.apk';
  private downloadInProgress = false;

  private installer(): any {
    return (Capacitor as any).Plugins?.InstallApk ?? null;
  }

  // Download the current APK with progress (0..1). Returns 'ready' once the
  // file is saved, 'failed' on any error. Uses fetch with keepalive on native
  // which helps downloads continue when app is briefly backgrounded.
  async download(onProgress: (fraction: number) => void): Promise<'ready' | 'failed'> {
    if (this.downloadInProgress) return 'failed';
    this.downloadInProgress = true;

    try {
      const token = this.auth.token;
      if (!token) {
        this.downloadInProgress = false;
        return 'failed';
      }

      // Native and web: use fetch with keepalive to improve resilience
      const res = await fetch(`${environment.apiBase}/app/download`, {
        headers: { Authorization: `Bearer ${token}` },
        keepalive: true // Helps keep connection alive during brief backgrounding
      });
      if (!res.ok) {
        this.downloadInProgress = false;
        return 'failed';
      }

      const total = Number(res.headers.get('content-length') ?? 0);
      const reader = res.body?.getReader();
      if (!reader) {
        this.downloadInProgress = false;
        return 'failed';
      }

      const chunks: Uint8Array[] = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (total > 0) onProgress(received / total);
      }
      // A short read means the connection dropped mid-file: a truncated APK
      // would "download fine" but fail to parse in the installer.
      if (total > 0 && received !== total) {
        this.downloadInProgress = false;
        return 'failed';
      }
      onProgress(1);

      const blob = new Blob(chunks, { type: 'application/vnd.android.package-archive' });
      const base64 = await blobToBase64(blob);
      await Filesystem.writeFile({ path: this.fileName, data: base64, directory: Directory.Cache });
      this.downloadInProgress = false;
      return 'ready';
    } catch {
      this.downloadInProgress = false;
      return 'failed';
    }
  }

  // Launch Android's package installer for the downloaded APK. The plugin
  // gets both the resolved URI and the native hints (name + directory) so it
  // can find the file even if the URI format changes between Capacitor
  // versions. Returns the real failure message so the UI can show it.
  async installDownloaded(): Promise<{ ok: boolean; blocked: boolean; message: string }> {
    try {
      if (!Capacitor.isNativePlatform()) return { ok: false, blocked: false, message: 'Not running on a device' };
      const plugin = this.installer();
      if (!plugin) return { ok: false, blocked: false, message: 'Installer plugin is missing' };
      const uri = await Filesystem.getUri({ path: this.fileName, directory: Directory.Cache });
      await plugin.install({ filePath: uri.uri, fileName: this.fileName, directory: 'cache' });
      return { ok: true, blocked: false, message: '' };
    } catch (e: any) {
      return {
        ok: false,
        blocked: e?.code === 'INSTALL_BLOCKED',
        message: typeof e?.message === 'string' && e.message ? e.message : 'Unknown install error',
      };
    }
  }

  // Open the system "Install unknown apps" screen for this app (Android 8+).
  async openInstallSettings(): Promise<void> {
    try {
      const plugin = this.installer();
      if (plugin?.openInstallSettings) await plugin.openInstallSettings();
    } catch { /* best effort */ }
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
