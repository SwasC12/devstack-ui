import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { environment } from '../environments/environment';

// Firebase Cloud Messaging device registration. Native (Android APK) only -
// the web app relies on the in-app notifications inbox. Registration happens
// after every successful login (AuthService.storeSession); the token moves
// with the user and is dropped on logout.
//
// Every failure path is swallowed on purpose: push is a convenience, never a
// reason the till can't open (no Play services, permission denied, etc.).
const TOKEN_KEY = 'pos_push_token';

@Injectable({ providedIn: 'root' })
export class PushService {
  private http = inject(HttpClient);
  private deviceToken: string | null = null;

  constructor() {
    try { this.deviceToken = sessionStorage.getItem(TOKEN_KEY); } catch { /* storage unavailable */ }
  }

  get isNative(): boolean { return Capacitor.isNativePlatform(); }

  async init(): Promise<void> {
    if (!this.isNative) return;
    try {
      let perm = await PushNotifications.checkPermissions();
      if (perm.receive === 'prompt') perm = await PushNotifications.requestPermissions();
      if (perm.receive !== 'granted') return;

      await PushNotifications.addListener('registration', (t) => {
        this.deviceToken = t.value;
        try { sessionStorage.setItem(TOKEN_KEY, t.value); } catch { /* ignore */ }
        // The auth interceptor adds the bearer token; not-logged-in => 401, ignored.
        this.http.post(`${environment.apiBase}/push/register`, { token: t.value, platform: 'android' })
          .subscribe({ error: () => { /* retry next login */ } });
      });
      await PushNotifications.addListener('registrationError', () => { /* no Play services / denied */ });
      await PushNotifications.register();
    } catch { /* push unavailable - never block the app */ }
  }

  // Called from AuthService.logout() while the session is still valid so the
  // unregister call authenticates. Best-effort.
  unregister(): void {
    const token = this.deviceToken;
    if (!token) return;
    this.deviceToken = null;
    try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
    try { void PushNotifications.unregister(); } catch { /* ignore */ }
    this.http.post(`${environment.apiBase}/push/unregister`, { token })
      .subscribe({ error: () => { /* token expires server-side anyway */ } });
  }
}
