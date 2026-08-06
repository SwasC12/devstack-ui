import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { MenuItem } from './menu-item.model';
import { Category } from './category.model';
import { AuthService } from './auth.service';
import { environment } from '../environments/environment';
import { compressImage } from './image-utils';

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
    // Compress the image client-side first (downscale + WebP) so Cloudinary
    // storage doesn't fill up with full-res phone photos. Invisible to the
    // user; small files pass through untouched.
    return from(compressImage(file)).pipe(
      switchMap((compressed) => {
        const form = new FormData();
        form.append('file', compressed);
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
      })
    );
  }

  placeOrder(cart: { id: number; name: string; price: number; quantity: number; sizeId?: number; note?: string; modifierIds?: number[] }[], payment?: { method: 'cash' | 'card'; amountReceived?: number | null }, discountId?: number | null, meta?: { customerName?: string; customerPhone?: string; notes?: string }): Observable<any> {
    const body: any = {
      items: cart.map(i => ({ menuItemId: i.id, name: i.name, price: i.price, quantity: i.quantity, sizeId: i.sizeId ?? null, note: i.note ?? null, modifierIds: i.modifierIds?.length ? i.modifierIds : null }))
    };
    if (payment) {
      body.paymentMethod = payment.method;
      if (payment.method === 'cash') body.amountReceived = payment.amountReceived ?? null;
    }
    if (discountId) body.discountId = discountId;
    if (meta?.customerName) body.customerName = meta.customerName;
    if (meta?.customerPhone) body.customerPhone = meta.customerPhone;
    if (meta?.notes) body.notes = meta.notes;
    return this.http.post(`${API}/orders`, body);
  }

  getSummary(): Observable<any> {
    return this.http.get(`${API}/orders/summary`);
  }

  // Owner analytics: daily series, per-cashier, per-category for the last N days.
  getAnalytics(days: number): Observable<any> {
    return this.http.get(`${API}/orders/analytics?days=${days}`);
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

  // ── Discounts / specials ───────────────────────────────

  getDiscounts(): Observable<any[]> {
    return this.http.get<any[]>(`${API}/discounts`);
  }

  writeDiscount(data: any): Observable<any> {
    return this.http.put<any>(`${API}/discounts`, data);
  }

  deleteDiscount(id: number): Observable<void> {
    return this.http.delete<void>(`${API}/discounts/${id}`);
  }

  getActiveShift(): Observable<{ active: boolean; id?: number; startTime?: string }> {
    return this.http.get<{ active: boolean; id?: number; startTime?: string }>(`${API}/shifts/active`);
  }

  startShift(): Observable<any> {
    return this.http.post(`${API}/shifts/start`, {});
  }

  endShift(): Observable<void> {
    return this.http.post<void>(`${API}/shifts/end`, {});
  }

  // Sales summary for the caller's latest shift (shown at clock-out).
  getShiftSummary(): Observable<any> {
    return this.http.get(`${API}/shifts/summary`);
  }

  // ── Password ───────────────────────────────────────────

  changePassword(current: string, newPass: string): Observable<void> {
    return this.http.post<void>(`${API}/auth/change-password`, { currentPassword: current, newPassword: newPass });
  }

  // ── Shops ────────────────────────────────────────────

  // Superadmin: all shops with lifecycle status + usage stats.
  getShops(): Observable<any[]> {
    return this.http.get<any[]>(`${API}/shops`);
  }

  createShop(data: { name: string; code: string; adminUsername: string; adminPassword: string; adminDisplayName: string }): Observable<any> {
    return this.http.post(`${API}/shops`, data);
  }

  // Superadmin: suspend (false) or reactivate (true) a tenant.
  setShopStatus(id: number, isActive: boolean): Observable<any> {
    return this.http.put(`${API}/shops/${id}/status`, { isActive });
  }

  // Superadmin: fresh random password for the shop's first admin, returned once.
  resetShopAdminPassword(id: number): Observable<{ password: string; username: string; displayName: string }> {
    return this.http.post<{ password: string; username: string; displayName: string }>(`${API}/shops/${id}/reset-admin-password`, {});
  }

  // ── Orders (admin history) ────────────────────────────

  getOrders(): Observable<any[]> {
    return this.http.get<any[]>(`${API}/orders`);
  }

  voidOrder(id: number, reason: string): Observable<void> {
    return this.http.post<void>(`${API}/orders/${id}/void`, { reason });
  }

  // Current shop (any logged-in shop user): branding shown in the POS.
  getShopInfo(): Observable<{ id: number; name: string; code: string; logoUrl?: string | null; receiptQrUrl?: string | null }> {
    return this.http.get<{ id: number; name: string; code: string; logoUrl?: string | null; receiptQrUrl?: string | null }>(`${API}/shops/me`);
  }

  // Owner (admin): update the current shop's branding.
  updateShopInfo(data: { name: string; logoUrl?: string | null; receiptQrUrl?: string | null }): Observable<{ id: number; name: string; code: string; logoUrl?: string | null; receiptQrUrl?: string | null }> {
    return this.http.put<{ id: number; name: string; code: string; logoUrl?: string | null; receiptQrUrl?: string | null }>(`${API}/shops/me`, data);
  }

  // Superadmin: broadcast an announcement to all shop owners (or one shop).
  // Creates their in-app notification AND fires an FCM push to their devices.
  broadcastNotification(title: string, body: string, shopId?: number | null): Observable<{ delivered: number; pushed: number }> {
    return this.http.post<{ delivered: number; pushed: number }>(`${API}/notifications/broadcast`, { title, body, shopId });
  }
}
