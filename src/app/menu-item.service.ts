import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { MenuItem } from './menu-item.model';
import { environment } from '../environments/environment';

const API = environment.apiBase;

@Injectable({ providedIn: 'root' })
export class MenuItemService {
  private http = inject(HttpClient);

  getItems(): Observable<MenuItem[]> {
    return this.http.get<MenuItem[]>(`${API}/menuitems`);
  }

  writeItem(item: Partial<MenuItem>): Observable<MenuItem> {
    return this.http.put<MenuItem>(`${API}/menuitems`, item);
  }

  deleteItem(id: number): Observable<void> {
    return this.http.delete<void>(`${API}/menuitems/${id}`);
  }

  uploadImage(file: File): Observable<{ url: string; publicId: string }> {
    const { cloudName, uploadPreset } = environment.cloudinary;
    const form = new FormData();
    form.append('file', file);
    form.append('upload_preset', uploadPreset);

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

  createUser(data: { username: string; password: string; displayName: string; role: string }): Observable<any> {
    return this.http.post(`${API}/users`, data);
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
}
