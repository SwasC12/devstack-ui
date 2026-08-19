import { bootstrapApplication } from '@angular/platform-browser';
import { Capacitor } from '@capacitor/core';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

// Self-heal for already-installed APKs: earlier builds registered the Angular
// service worker inside the native WebView, which then serves a stale cached
// bundle even after a new APK is installed (updates "don't apply"). On native,
// unregister any existing SW and drop its caches so the freshly-installed code
// always wins. New native builds never register it in the first place
// (see app.config.ts).
if (Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then(regs => regs.forEach(r => void r.unregister()))
    .catch(() => { /* ignore */ });
  if ('caches' in window) {
    caches.keys().then(keys => keys.forEach(k => void caches.delete(k))).catch(() => { /* ignore */ });
  }
}

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
