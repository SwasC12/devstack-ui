import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../environments/environment';

export interface LoginResponse {
  token: string;
  username: string;
  displayName: string;
  role: string;
  shopId?: number | null;
  shopName?: string | null;
  shopCode?: string | null;
}

const TOKEN_KEY = 'pos_token';
const USER_KEY = 'pos_user';
const SHOP_KEY = 'pos_shop';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);

  get isLoggedIn(): boolean {
    return !!localStorage.getItem(TOKEN_KEY);
  }

  get token(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  getUser(): { username: string; displayName: string; role: string } | null {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  // Shop context of the logged-in user (null for superadmins).
  getShop(): { id: number; name: string; code: string } | null {
    const raw = localStorage.getItem(SHOP_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  // Shop staff login — shop code always required (superadmins have no shop).
  login(shopCode: string, username: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${environment.apiBase}/auth/login`, { shopCode, username, password })
      .pipe(tap(res => this.storeSession(res)));
  }

  // Platform owner login — separate endpoint, no shop code.
  superadminLogin(username: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${environment.apiBase}/auth/superadmin-login`, { username, password })
      .pipe(tap(res => this.storeSession(res)));
  }

  // Self-service account update — username, display name and optionally password.
  // Updates the stored session so the change is visible system-wide immediately.
  updateProfile(currentPassword: string, username: string, displayName: string, newPassword: string): Observable<{ username: string; displayName: string }> {
    return this.http.post<{ username: string; displayName: string }>(`${environment.apiBase}/auth/profile`, {
      currentPassword, username, displayName, newPassword: newPassword || null
    }).pipe(tap(res => {
      const user = this.getUser();
      localStorage.setItem(USER_KEY, JSON.stringify({
        username: res.username,
        displayName: res.displayName,
        role: user?.role ?? 'admin'
      }));
    }));
  }

  private storeSession(res: LoginResponse): void {
    localStorage.setItem(TOKEN_KEY, res.token);
    localStorage.setItem(USER_KEY, JSON.stringify({ username: res.username, displayName: res.displayName, role: res.role }));
    if (res.shopId != null) {
      localStorage.setItem(SHOP_KEY, JSON.stringify({ id: res.shopId, name: res.shopName, code: res.shopCode }));
    } else {
      localStorage.removeItem(SHOP_KEY);
    }
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(SHOP_KEY);
  }
}
