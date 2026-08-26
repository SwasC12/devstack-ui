import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, finalize, from, switchMap } from 'rxjs';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { environment } from '../environments/environment';
import { PushService } from './push.service';

export interface LoginResponse {
  token: string;
  username: string;
  displayName: string;
  role: string;
  shopId?: number | null;
  shopName?: string | null;
  shopCode?: string | null;
  refreshToken?: string | null;
}

export interface StaffMember { id: number; displayName: string; role: string; }

const USER_KEY = 'pos_user';
const SHOP_KEY = 'pos_shop';
const REFRESH_KEY = 'pos_refresh';
// Security note: the ACCESS token is held in MEMORY only — never localStorage.
// The REFRESH token lives in an HttpOnly cookie on web; in the native app it is
// persisted in device storage (Capacitor Preferences) because WebView cookies
// don't reliably survive an app kill on all Android devices. Only non-secret
// display context (user + shop) lives in localStorage.

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private push = inject(PushService);
  private _token: string | null = null;
  private ready: Promise<void> | null = null;
  private refreshInFlight: Observable<LoginResponse> | null = null;
  private isNative = Capacitor.isNativePlatform();

  get isLoggedIn(): boolean { return !!this._token; }
  get token(): string | null { return this._token; }

  getUser(): { username: string; displayName: string; role: string } | null {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  // Shop context of the logged-in user (null for superadmins).
  getShop(): { id: number; name: string; code: string } | null {
    const raw = localStorage.getItem(SHOP_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  // Restore a session from the refresh cookie. Run once at startup and awaited
  // by every route guard so a reload never flashes the login screen.
  ensureReady(): Promise<void> {
    if (!this.ready) {
      this.ready = new Promise(resolve => {
        if (this._token) { resolve(); return; }
        this.refresh().subscribe({
          next: () => resolve(),
          error: () => {
            // Transient failure (API cold start, flaky network): don't cache a
            // dead 'ready' - let the next guard/initializer call retry.
            this.ready = null;
            // No internet but a session was active before: enter offline mode
            // so the cashier can keep selling from the cached menu + queued
            // orders. The real session restores via refresh when back online.
            if (!navigator.onLine && this.getUser()) this._token = 'offline';
            resolve();
          }
        });
      });
    }
    return this.ready;
  }

  login(shopCode: string, username: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${environment.apiBase}/auth/login`, { shopCode, username, password })
      .pipe(tap(res => this.storeSession(res)));
  }

  superadminLogin(username: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${environment.apiBase}/auth/superadmin-login`, { username, password })
      .pipe(tap(res => this.storeSession(res)));
  }

  // Fast cashier sign-in: staff list, tap a name, enter the PIN.
  getStaff(shopCode: string): Observable<StaffMember[]> {
    return this.http.post<StaffMember[]>(`${environment.apiBase}/auth/staff`, { shopCode });
  }

  pinLogin(shopCode: string, userId: number, pin: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${environment.apiBase}/auth/pin-login`, { shopCode, userId, pin })
      .pipe(tap(res => this.storeSession(res)));
  }

  refresh(): Observable<LoginResponse> {
    // Single-flight: the server rotates the refresh token on every use and
    // burns the whole chain if an old token is ever replayed. If two requests
    // 401 at the same instant (parallel calls right after the 15-min access
    // token expires), they must share ONE refresh - otherwise the second one
    // presents the already-rotated token and the session dies.
    if (!this.refreshInFlight) {
      this.refreshInFlight = from(this.getStoredRefresh()).pipe(
        switchMap(refreshToken =>
          this.http.post<LoginResponse>(`${environment.apiBase}/auth/refresh`, { refreshToken })
            .pipe(tap(res => this.storeSession(res)))
        ),
        finalize(() => { this.refreshInFlight = null; })
      );
    }
    return this.refreshInFlight;
  }

  logout(): Observable<void> {
    return from(this.getStoredRefresh()).pipe(
      switchMap(refreshToken =>
        this.http.post<void>(`${environment.apiBase}/auth/logout`, { refreshToken })
          .pipe(
            // Still authenticated here: drop this device's push token first.
            tap(() => this.push.unregister()),
            finalize(() => this.clearSession())
          )
      )
    );
  }

  // ── Impersonation ("view as shop") ───────────────────────────────────────
  // The superadmin's own session is stashed in memory and the active session is
  // swapped to a shop-admin token. A page reload restores the superadmin via the
  // refresh cookie (impersonation is intentionally ephemeral), and Exit restores
  // it immediately. No shop refresh token is stored, so nothing to clean up.
  private _impBackup: { token: string; user: string | null } | null = null;
  get impersonating(): boolean { return !!this._impBackup; }

  impersonate(shopId: number): Observable<any> {
    return this.http.post<any>(`${environment.apiBase}/shops/${shopId}/impersonate`, {}).pipe(
      tap(res => {
        this._impBackup = { token: this._token!, user: localStorage.getItem(USER_KEY) };
        this._token = res.token;
        localStorage.setItem(USER_KEY, JSON.stringify({ username: res.username, displayName: res.displayName, role: 'admin' }));
        localStorage.setItem(SHOP_KEY, JSON.stringify({ id: res.shopId, name: res.shopName, code: res.shopCode }));
      })
    );
  }

  exitImpersonation(): void {
    if (!this._impBackup) return;
    this._token = this._impBackup.token;
    if (this._impBackup.user) localStorage.setItem(USER_KEY, this._impBackup.user);
    else localStorage.removeItem(USER_KEY);
    localStorage.removeItem(SHOP_KEY);
    this._impBackup = null;
  }

  // Public so the interceptor can force-clear when a refresh fails.
  clearSession(): void {
    this._impBackup = null;
    this._token = null;
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(SHOP_KEY);
    if (this.isNative) void Preferences.remove({ key: REFRESH_KEY });
  }

  // Self-service account update — username, display name and optionally password.
  updateProfile(currentPassword: string, username: string, displayName: string, newPassword: string): Observable<{ username: string; displayName: string }> {
    return this.http.post<{ username: string; displayName: string }>(`${environment.apiBase}/auth/profile`, {
      currentPassword, username, displayName, newPassword: newPassword || null
    }).pipe(tap(res => {
      const user = this.getUser();
      localStorage.setItem(USER_KEY, JSON.stringify({ username: res.username, displayName: res.displayName, role: user?.role ?? 'admin' }));
    }));
  }

  private storeSession(res: LoginResponse): void {
    this._token = res.token;
    localStorage.setItem(USER_KEY, JSON.stringify({ username: res.username, displayName: res.displayName, role: res.role }));
    if (res.shopId != null) {
      localStorage.setItem(SHOP_KEY, JSON.stringify({ id: res.shopId, name: res.shopName, code: res.shopCode }));
    } else {
      localStorage.removeItem(SHOP_KEY);
    }
    // Native app: persist the refresh token in device storage so the session
    // survives an app kill. The server only returns it to X-Client: native.
    if (this.isNative && res.refreshToken) {
      void Preferences.set({ key: REFRESH_KEY, value: res.refreshToken });
    }
    // Native app: bind this device to the signed-in user for push.
    void this.push.init();
  }

  private async getStoredRefresh(): Promise<string | null> {
    if (!this.isNative) return null;
    const { value } = await Preferences.get({ key: REFRESH_KEY });
    return value ?? null;
  }
}
