import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Tool } from './tool.model';
import { environment } from '../environments/environment';

// API base comes from the environment file, so it's local during `ng serve`
// and live in a production build — no code change needed to switch.
const API_BASE = environment.apiBase;

@Injectable({ providedIn: 'root' })
export class ToolService {
  private http = inject(HttpClient);

  getTools(): Observable<Tool[]> {
    return this.http.get<Tool[]>(`${API_BASE}/tools`);
  }

  createTool(tool: Partial<Tool>): Observable<Tool> {
    return this.http.post<Tool>(`${API_BASE}/tools`, tool);
  }

  deleteTool(id: number): Observable<void> {
    return this.http.delete<void>(`${API_BASE}/tools/${id}`);
  }
}
