import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { MenuItem } from './menu-item.model';
import { environment } from '../environments/environment';

// API base comes from the environment file, so it's local during `ng serve`
// and live in a production build — no code change needed to switch.
const API_BASE = environment.apiBase;

@Injectable({ providedIn: 'root' })
export class MenuItemService {
  private http = inject(HttpClient);

  getItems(): Observable<MenuItem[]> {
    return this.http.get<MenuItem[]>(`${API_BASE}/menuitems`);
  }

  // Single write call: create or edit. Omit `id` (or send 0) to create a new
  // item; include a real id to edit that one. The API decides based on the id.
  writeItem(item: Partial<MenuItem>): Observable<MenuItem> {
    return this.http.put<MenuItem>(`${API_BASE}/menuitems`, item);
  }

  deleteItem(id: number): Observable<void> {
    return this.http.delete<void>(`${API_BASE}/menuitems/${id}`);
  }

  // Uploads an image straight to Cloudinary using an *unsigned* upload preset
  // (no server secret needed — safe for a browser). Returns the URL and public_id.
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
}
