import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, finalize } from 'rxjs';
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
}

export interface StaffMember { id: number; displayName: string; role: string; }

const USER_KEY = 'pos_user';
const SHOP_KEY = 'pos_shop';
// Security note: the ACCESS token is held in MEMORY only — never localStorage.
// The REFRESH token lives in an HttpOnly cookie the server manages, so a page
// reload restores the session through /auth/refresh instead of a stored token.
// Only non-secret display context (user + shop) lives in localStorage.

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private push = inject(PushService);
  private _token: string | null = null;
  private ready: Promise<void> | null = null;

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
        this.refresh().subscribe({ next: () => resolve(), error: () => resolve() });
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
    return this.http.post<LoginResponse>(`${environment.apiBase}/auth/refresh`, {})
      .pipe(tap(res => this.storeSession(res)));
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${environment.apiBase}/auth/logout`, {})
      .pipe(
        // Still authenticated here: drop this device's push token first.
        tap(() => this.push.unregister()),
        finalize(() => this.clearSession())
      );
  }

  // Public so the interceptor can force-clear when a refresh fails.
  clearSession(): void {
    this._token = null;
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(SHOP_KEY);
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
    // Native app: bind this device to the signed-in user for push.
    void this.push.init();
  }
}
