import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, from, of, throwError } from 'rxjs';
import { map, switchMap, tap, catchError } from 'rxjs/operators';
import { MenuItem } from './menu-item.model';
import { Category } from './category.model';
import { AuthService } from './auth.service';
import { environment } from '../environments/environment';
import { compressImage } from './image-utils';
import { OfflineService } from './offline.service';

const API = environment.apiBase;

@Injectable({ providedIn: 'root' })
export class MenuItemService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private offline = inject(OfflineService);

  getItems(): Observable<MenuItem[]> {
    return this.http.get<MenuItem[]>(`${API}/menuitems`).pipe(
      tap(items => void this.offline.cacheMenu('items', items)),
      catchError(err => this.fallbackOrThrow('items', err, []))
    );
  }

  writeItem(item: Partial<MenuItem>): Observable<MenuItem> {
    return this.http.put<MenuItem>(`${API}/menuitems`, item);
  }

  deleteItem(id: number): Observable<void> {
    return this.http.delete<void>(`${API}/menuitems/${id}`);
  }

  // ── Categories ──────────────────────────────────────────────

  getCategories(): Observable<Category[]> {
    return this.http.get<Category[]>(`${API}/categories`).pipe(
      tap(cats => void this.offline.cacheMenu('categories', cats)),
      catchError(err => this.fallbackOrThrow('categories', err, []))
    );
  }

  writeCategory(data: Partial<Category>): Observable<Category> {
    return this.http.put<Category>(`${API}/categories`, data);
  }

  deleteCategory(id: number): Observable<void> {
    return this.http.delete<void>(`${API}/categories/${id}`);
  }

  // Offline: serve the last good copy instead of failing the whole screen.
  private fallbackOrThrow(key: string, err: any, empty: any): Observable<any> {
    if (err?.status === 0 || err?.status == null) {
      return from(this.offline.cachedMenu(key)).pipe(map(cached => cached ?? empty));
    }
    return throwError(() => err);
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

  placeOrder(cart: { id: number; name: string; price: number; quantity: number; sizeId?: number; note?: string; modifierIds?: number[] }[], payment?: { method: 'cash' | 'card'; amountReceived?: number | null; dineMode?: string | null; tableNumber?: string | null; payments?: { method: string; amount: number }[]; tip?: number | null; serviceChargePct?: number | null; accountCustomerId?: number | null }, discountId?: number | null, offlineSnapshot?: any): Observable<any> {
    const body: any = {
      items: cart.map(i => ({ menuItemId: i.id, name: i.name, price: i.price, quantity: i.quantity, sizeId: i.sizeId ?? null, note: i.note ?? null, modifierIds: i.modifierIds?.length ? i.modifierIds : null }))
    };
    if (payment) {
      body.paymentMethod = payment.method;
      if (payment.method === 'cash') body.amountReceived = payment.amountReceived ?? null;
      if (payment.payments?.length) body.payments = payment.payments;
      if (payment.tip) body.tip = payment.tip;
      if (payment.serviceChargePct) body.serviceChargePct = payment.serviceChargePct;
      if (payment.accountCustomerId) body.accountCustomerId = payment.accountCustomerId;
    }
    if (discountId) body.discountId = discountId;
    if (payment?.dineMode) body.dineMode = payment.dineMode;
    if (payment?.tableNumber) body.tableNumber = payment.tableNumber;
    return this.http.post(`${API}/orders`, body).pipe(
      catchError(err => {
        // Internet down: queue the order locally and return a local receipt
        // order so the sale completes. It syncs automatically when back online.
        if (err?.status === 0 || err?.status == null) {
          void this.offline.queueOrder(`${API}/orders`, body);
          const total = offlineSnapshot?.total ?? cart.reduce((s, i) => s + i.price * i.quantity, 0);
          return of({
            id: offlineSnapshot?.id ?? `LOC-${Date.now()}`,
            createdAt: new Date().toISOString(),
            items: cart.map(i => ({
              id: i.id, name: i.name, price: i.price, quantity: i.quantity,
              note: i.note ?? null, sizeName: null, modifiers: []
            })),
            discountAmount: offlineSnapshot?.discountAmount ?? 0,
            discountName: offlineSnapshot?.discountName ?? null,
            total,
            paymentMethod: payment?.method ?? 'cash',
            amountReceived: offlineSnapshot?.amountReceived ?? null,
            changeGiven: offlineSnapshot?.changeGiven ?? null,
            offline: true,
            dineMode: payment?.dineMode ?? null,
            tableNumber: payment?.tableNumber ?? null,
          });
        }
        return throwError(() => err);
      })
    );
  }

  getCashup(date?: string): Observable<any> {
    return this.http.get(`${API}/orders/cashup${date ? `?date=${date}` : ''}`);
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

  createUser(data: { username: string; password: string; displayName: string; role: string; pin?: string | null; wageRate?: number | null }): Observable<any> {
    return this.http.post(`${API}/users`, data);
  }

  updateUser(id: number, data: { displayName: string; role: string; wageRate?: number | null }): Observable<any> {
    return this.http.put(`${API}/users/${id}`, data);
  }

  setUserPin(id: number, pin: string): Observable<void> {
    return this.http.post<void>(`${API}/users/${id}/pin`, { pin });
  }

  deleteUser(id: number): Observable<void> {
    return this.http.delete<void>(`${API}/users/${id}`);
  }

  // Timesheet: hours worked per employee for a date range (admin only).
  getTimesheet(from: string, to: string): Observable<any> {
    return this.http.get(`${API}/shifts/timesheet?from=${from}&to=${to}`);
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

  startShift(startingFloat?: number): Observable<any> {
    return this.http.post(`${API}/shifts/start`, { startingFloat: startingFloat ?? 0 });
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

  // Superadmin: platform dashboard counters + recent activity feed.
  getPlatformOverview(): Observable<any> {
    return this.http.get(`${API}/platform/overview`);
  }

  // Superadmin: platform health (API/DB/push/storage availability).
  getPlatformHealth(): Observable<any> {
    return this.http.get(`${API}/platform/health`);
  }

  // ── In-app updater ──────────────────────────────────

  getAppVersion(): Observable<any> {
    return this.http.get(`${API}/app/version`);
  }

  checkinApp(version: string): Observable<void> {
    return this.http.post<void>(`${API}/app/checkin`, { version });
  }

  getReleases(): Observable<any[]> {
    return this.http.get<any[]>(`${API}/app/releases`);
  }

  publishRelease(form: FormData): Observable<any> {
    return this.http.post(`${API}/app/releases`, form);
  }

  deleteRelease(id: number): Observable<void> {
    return this.http.delete<void>(`${API}/app/releases/${id}`);
  }

  createShop(data: { name: string; code: string; adminUsername: string; adminPassword: string; adminDisplayName: string; ownerEmail?: string | null }): Observable<any> {
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

  // Orders (admin history) - paged. The API used to return every order ever
  // on one call; now it's bounded (last 30 days / 200 rows by default) with
  // X-Total-Count so the UI can page through history.
  getOrders(from?: string, to?: string, limit = 200, offset = 0): Observable<{ list: any[]; total: number }> {
    const q: string[] = [`limit=${limit}`, `offset=${offset}`];
    if (from) q.push(`from=${encodeURIComponent(from)}`);
    if (to) q.push(`to=${encodeURIComponent(to)}`);
    return this.http.get<any[]>(`${API}/orders?${q.join('&')}`, { observe: 'response' }).pipe(
      map(res => ({ list: res.body ?? [], total: Number(res.headers.get('X-Total-Count') ?? res.body?.length ?? 0) }))
    );
  }

  voidOrder(id: number, reason: string): Observable<void> {
    return this.http.post<void>(`${API}/orders/${id}/void`, { reason });
  }

  refundOrder(id: number, amount: number, reason: string): Observable<void> {
    return this.http.post<void>(`${API}/orders/${id}/refund`, { amount, reason });
  }

  // Kitchen display: live queue + "done" action. Marked X-Background so the
  // global loader never flashes on polls; sends If-None-Match so an unchanged
  // queue comes back as a cheap 304 (list = null -> caller just updates its
  // clock, no re-render, no chime).
  getKitchenOrders(minutes = 120, etag?: string | null, station?: string): Observable<{ list: any[] | null; etag: string | null }> {
    let headers = new HttpHeaders({ 'X-Background': '1' });
    if (etag) headers = headers.set('If-None-Match', etag);
    return this.http.get<any[]>(`${API}/orders/kitchen?minutes=${minutes}${station ? `&station=${station}` : ''}`, { headers, observe: 'response' }).pipe(
      map(res => ({ list: res.status === 304 ? null : (res.body ?? []), etag: res.headers.get('ETag') ?? null }))
    );
  }

  completeOrder(id: number): Observable<void> {
    return this.http.post<void>(`${API}/orders/${id}/complete`, {});
  }

  // KDS hold & send: pause an order (held strip) or put it back in the queue.
  holdOrder(id: number): Observable<void> {
    return this.http.post<void>(`${API}/orders/${id}/hold`, {});
  }

  sendOrder(id: number): Observable<void> {
    return this.http.post<void>(`${API}/orders/${id}/send`, {});
  }

  getHeldOrders(station?: string): Observable<any[]> {
    // Background request: never flash the global loader (it refreshes
    // alongside the queue poll and on hold/send taps).
    const headers = new HttpHeaders({ 'X-Background': '1' });
    return this.http.get<any[]>(`${API}/orders/kitchen/held${station ? `?station=${station}` : ''}`, { headers });
  }

  // Transaction journal: every money event with running balance.
  getJournal(from?: string, to?: string): Observable<{ openingBalance: number; closingBalance: number; events: any[] }> {
    const q: string[] = [];
    if (from) q.push(`from=${encodeURIComponent(from)}`);
    if (to) q.push(`to=${encodeURIComponent(to)}`);
    return this.http.get<{ openingBalance: number; closingBalance: number; events: any[] }>(`${API}/orders/journal${q.length ? `?${q.join('&')}` : ''}`);
  }

  // ── Customers (directory + house accounts) ──────────────────────────────

  getCustomers(q?: string): Observable<any[]> {
    return this.http.get<any[]>(`${API}/customers${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  }

  createCustomer(data: { name: string; phone?: string | null; email?: string | null; creditLimit: number; notes?: string | null }): Observable<any> {
    return this.http.post(`${API}/customers`, data);
  }

  updateCustomer(id: number, data: { name: string; phone?: string | null; email?: string | null; creditLimit: number; notes?: string | null }): Observable<any> {
    return this.http.put(`${API}/customers/${id}`, data);
  }

  deleteCustomer(id: number): Observable<void> {
    return this.http.delete<void>(`${API}/customers/${id}`);
  }

  settleCustomer(id: number, amount: number, method: string): Observable<any> {
    return this.http.post(`${API}/customers/${id}/settle`, { amount, method });
  }

  // ── Suppliers & purchase orders ─────────────────────────────────────────

  getSuppliers(): Observable<any[]> {
    return this.http.get<any[]>(`${API}/suppliers`);
  }

  createSupplier(data: { name: string; phone?: string | null; email?: string | null }): Observable<any> {
    return this.http.post(`${API}/suppliers`, data);
  }

  updateSupplier(id: number, data: { name: string; phone?: string | null; email?: string | null }): Observable<any> {
    return this.http.put(`${API}/suppliers/${id}`, data);
  }

  deleteSupplier(id: number): Observable<void> {
    return this.http.delete<void>(`${API}/suppliers/${id}`);
  }

  getPurchaseOrders(): Observable<any[]> {
    return this.http.get<any[]>(`${API}/suppliers/orders`);
  }

  createPurchaseOrder(data: { supplierId: number; freightCost: number; dutyCost: number; notes?: string | null; lines: { menuItemId: number; quantity: number; unitCost: number }[] }): Observable<any> {
    return this.http.post(`${API}/suppliers/orders`, data);
  }

  receivePurchaseOrder(id: number, lines: { lineId: number; quantity: number }[]): Observable<any> {
    return this.http.post(`${API}/suppliers/orders/${id}/receive`, lines);
  }

  // ── Expenses & petty cash ───────────────────────────────────────────────

  getExpenses(from?: string, to?: string): Observable<{ total: number; items: any[] }> {
    const q: string[] = [];
    if (from) q.push(`from=${encodeURIComponent(from)}`);
    if (to) q.push(`to=${encodeURIComponent(to)}`);
    return this.http.get<{ total: number; items: any[] }>(`${API}/expenses${q.length ? `?${q.join('&')}` : ''}`);
  }

  createExpense(data: { category: string; amount: number; note?: string | null }): Observable<any> {
    return this.http.post(`${API}/expenses`, data);
  }

  deleteExpense(id: number): Observable<void> {
    return this.http.delete<void>(`${API}/expenses/${id}`);
  }

  // ── Audit trail ─────────────────────────────────────────────────────────

  getAudit(from?: string, to?: string, limit = 300): Observable<any[]> {
    const q: string[] = [`limit=${limit}`];
    if (from) q.push(`from=${encodeURIComponent(from)}`);
    if (to) q.push(`to=${encodeURIComponent(to)}`);
    return this.http.get<any[]>(`${API}/audit?${q.join('&')}`);
  }

  // Current shop (any logged-in shop user): branding + kitchen webhook shown in the POS.
  getShopInfo(): Observable<{ id: number; name: string; code: string; logoUrl?: string | null; receiptQrUrl?: string | null; kitchenUrl?: string | null }> {
    return this.http.get<{ id: number; name: string; code: string; logoUrl?: string | null; receiptQrUrl?: string | null; kitchenUrl?: string | null }>(`${API}/shops/me`);
  }

  // Owner (admin): update the current shop's branding + kitchen webhook.
  updateShopInfo(data: { name: string; logoUrl?: string | null; receiptQrUrl?: string | null; kitchenUrl?: string | null }): Observable<{ id: number; name: string; code: string; logoUrl?: string | null; receiptQrUrl?: string | null; kitchenUrl?: string | null }> {
    return this.http.put<{ id: number; name: string; code: string; logoUrl?: string | null; receiptQrUrl?: string | null; kitchenUrl?: string | null }>(`${API}/shops/me`, data);
  }

  // Superadmin: set a shop's owner contact details (for future owner emails).
  updateShopOwner(id: number, ownerEmail: string | null, ownerPhone: string | null): Observable<any> {
    return this.http.put(`${API}/shops/${id}/owner`, { ownerEmail, ownerPhone });
  }

  // Server-side email to one shop's owner (superadmin). Requires SMTP on the
  // API; the UI falls back to a mailto draft on 503/400.
  emailOwner(shopId: number, subject: string, body: string): Observable<{ sentTo: string }> {
    return this.http.post<{ sentTo: string }>(`${API}/notifications/email-owner?shopId=${shopId}`, { subject, body });
  }

  // Server-side email to every shop that has an owner email on file.
  emailBroadcast(subject: string, body: string): Observable<{ sent: number; failed: number }> {
    return this.http.post<{ sent: number; failed: number }>(`${API}/notifications/email-broadcast`, { subject, body });
  }

  // Superadmin: broadcast an announcement to all shop owners (or one shop).
  // Creates their in-app notification AND fires an FCM push to their devices.
  broadcastNotification(title: string, body: string, shopId?: number | null): Observable<{ delivered: number; pushed: number }> {
    return this.http.post<{ delivered: number; pushed: number }>(`${API}/notifications/broadcast`, { title, body, shopId });
  }


  // ── Notifications inbox (the admin bell) ──────────────

  getNotifications(): Observable<{ unread: number; items: any[] }> {
    // Background request: the bell polls every 45s - it must never flash the
    // full-screen loader while the admin is working.
    const headers = new HttpHeaders({ 'X-Background': '1' });
    return this.http.get<{ unread: number; items: any[] }>(`${API}/notifications`, { headers });
  }

  markNotificationRead(id: number): Observable<void> {
    return this.http.post<void>(`${API}/notifications/${id}/read`, {}, { headers: new HttpHeaders({ 'X-Background': '1' }) });
  }

  markAllNotificationsRead(): Observable<void> {
    return this.http.post<void>(`${API}/notifications/read-all`, {}, { headers: new HttpHeaders({ 'X-Background': '1' }) });
  }

  // Manager approval: is this PIN one of the shop's admins?
  verifyPin(pin: string): Observable<{ valid: boolean }> {
    return this.http.post<{ valid: boolean }>(`${API}/auth/verify-pin`, { pin });
  }
}
