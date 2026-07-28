import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Tool } from './tool.model';

// Base URL of the DevStack API on MonsterASP. (For local dev against the API on
// your machine, swap this for e.g. 'http://localhost:5099/api'.)
const API_BASE = 'https://devstack-api.runasp.net/api';

@Injectable({ providedIn: 'root' })
export class ToolService {
  private http = inject(HttpClient);

  getTools(): Observable<Tool[]> {
    return this.http.get<Tool[]>(`${API_BASE}/tools`);
  }
}
