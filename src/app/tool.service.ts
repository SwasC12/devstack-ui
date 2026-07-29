import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Tool } from './tool.model';

// Base URL of the DevStack API on MonsterASP.
// NOTE: http (not https) — the MonsterASP free plan doesn't offer SSL, so the
// API is HTTP-only. This works when the UI is also served over http (e.g.
// `ng serve` at http://localhost:4200). A production https UI (Vercel) can't
// call an http API (browser "mixed content" block) — that needs API SSL, which
// means a paid MonsterASP plan / support ticket, or hosting the API elsewhere.
const API_BASE = 'http://devstack-api.runasp.net/api';

@Injectable({ providedIn: 'root' })
export class ToolService {
  private http = inject(HttpClient);

  getTools(): Observable<Tool[]> {
    return this.http.get<Tool[]>(`${API_BASE}/tools`);
  }
}
