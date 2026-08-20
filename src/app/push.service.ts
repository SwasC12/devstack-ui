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
  private listenersAdded = false;

  constructor() {
    try { this.deviceToken = sessionStorage.getItem(TOKEN_KEY); } catch { /* storage unavailable */ }
  }

  get isNative(): boolean { return Capacitor.isNativePlatform(); }

  // Called after every login. Binds THIS device's FCM token to the signed-in
  // user so broadcasts / alerts to that user reach the device.
  async init(): Promise<void> {
    if (!this.isNative) return;
    try {
      // If we already hold a token (from a previous run/login), re-register it
      // NOW against the just-signed-in user. Android doesn't always re-emit the
      // 'registration' event on a subsequent register(), so relying on that
      // alone left the token bound to whoever first logged in - and a fresh
      // login (e.g. the shop admin) never got a token row. This closes that gap.
      if (this.deviceToken) this.postToken(this.deviceToken);

      // Add the plugin listeners once (not per-login, to avoid duplicates).
      if (!this.listenersAdded) {
        this.listenersAdded = true;
        await PushNotifications.addListener('registration', (t) => {
          this.deviceToken = t.value;
          try { sessionStorage.setItem(TOKEN_KEY, t.value); } catch { /* ignore */ }
          this.postToken(t.value);
        });
        await PushNotifications.addListener('registrationError', () => { /* no Play services / denied */ });
      }

      let perm = await PushNotifications.checkPermissions();
      if (perm.receive === 'prompt') perm = await PushNotifications.requestPermissions();
      if (perm.receive !== 'granted') return;
      await PushNotifications.register();
    } catch { /* push unavailable - never block the app */ }
  }

  // POST the token to the server. The auth interceptor adds the bearer token;
  // if not logged in yet it 401s and is ignored (re-tried on the next login).
  private postToken(token: string): void {
    this.http.post(`${environment.apiBase}/push/register`, { token, platform: 'android' })
      .subscribe({ error: () => { /* retry next login */ } });
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
