import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { MenuItem } from './menu-item.model';
import { Category } from './category.model';
import { AuthService } from './auth.service';
import { environment } from '../environments/environment';

const API = environment.apiBase;

@Injectable({ providedIn: 'root' })
export class MenuItemService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  getItems(): Observable<MenuItem[]> {
    return this.http.get<MenuItem[]>(`${API}/menuitems`);
  }

  writeItem(item: Partial<MenuItem>): Observable<MenuItem> {
    return this.http.put<MenuItem>(`${API}/menuitems`, item);
  }

  deleteItem(id: number): Observable<void> {
    return this.http.delete<void>(`${API}/menuitems/${id}`);
  }

  // ── Categories ──────────────────────────────────────────────

  getCategories(): Observable<Category[]> {
    return this.http.get<Category[]>(`${API}/categories`);
  }

  writeCategory(data: Partial<Category>): Observable<Category> {
    return this.http.put<Category>(`${API}/categories`, data);
  }

  deleteCategory(id: number): Observable<void> {
    return this.http.delete<void>(`${API}/categories/${id}`);
  }

  uploadImage(file: File): Observable<{ url: string; publicId: string }> {
    const { cloudName, uploadPreset } = environment.cloudinary;
    const form = new FormData();
    form.append('file', file);
    form.append('upload_preset', uploadPreset);
    // Keep each shop's images in its own Cloudinary folder.
    const code = this.auth.getShop()?.code;
    form.append('folder', code ? `shop-${code.toLowerCase()}` : 'shop-default');

    return this.http
      .post<{ secure_url: string; public_id: string }>(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        form
      )
      .pipe(map((res) => ({ url: res.secure_url, publicId: res.public_id })));
  }

  placeOrder(cart: { id: number; name: string; price: number; quantity: number }[]): Observable<any> {
    return this.http.post(`${API}/orders`, {
      items: cart.map(i => ({ menuItemId: i.id, name: i.name, price: i.price, quantity: i.quantity }))
    });
  }

  getSummary(): Observable<any> {
    return this.http.get(`${API}/orders/summary`);
  }

  // ── Users ───────────────────────────────────────────────

  getUsers(): Observable<any[]> {
    return this.http.get<any[]>(`${API}/users`);
  }

  createUser(data: { username: string; password: string; displayName: string; role: string; pin?: string | null }): Observable<any> {
    return this.http.post(`${API}/users`, data);
  }

  setUserPin(id: number, pin: string): Observable<void> {
    return this.http.post<void>(`${API}/users/${id}/pin`, { pin });
  }

  deleteUser(id: number): Observable<void> {
    return this.http.delete<void>(`${API}/users/${id}`);
  }

  // ── Shifts ─────────────────────────────────────────────

  getActiveShift(): Observable<{ active: boolean; id?: number; startTime?: string }> {
    return this.http.get<{ active: boolean; id?: number; startTime?: string }>(`${API}/shifts/active`);
  }

  startShift(): Observable<any> {
    return this.http.post(`${API}/shifts/start`, {});
  }

  endShift(): Observable<void> {
    return this.http.post<void>(`${API}/shifts/end`, {});
  }

  // ── Password ───────────────────────────────────────────

  changePassword(current: string, newPass: string): Observable<void> {
    return this.http.post<void>(`${API}/auth/change-password`, { currentPassword: current, newPassword: newPass });
  }

  // ── Shops ────────────────────────────────────────────

  // Superadmin: all shops.
  getShops(): Observable<any[]> {
    return this.http.get<any[]>(`${API}/shops`);
  }

  createShop(data: { name: string; code: string; adminUsername: string; adminPassword: string; adminDisplayName: string }): Observable<any> {
    return this.http.post(`${API}/shops`, data);
  }

  // Current shop (any logged-in shop user): branding shown in the POS.
  getShopInfo(): Observable<{ id: number; name: string; code: string; logoUrl?: string | null }> {
    return this.http.get<{ id: number; name: string; code: string; logoUrl?: string | null }>(`${API}/shops/me`);
  }

  // Owner (admin): update the current shop's branding.
  updateShopInfo(data: { name: string; logoUrl?: string | null }): Observable<{ id: number; name: string; code: string; logoUrl?: string | null }> {
    return this.http.put<{ id: number; name: string; code: string; logoUrl?: string | null }>(`${API}/shops/me`, data);
  }
}
