import { Routes } from '@angular/router';
import { authGuard, posGuard, loginGuard } from './auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/menu', pathMatch: 'full' },

  // Public
  { path: 'menu', loadComponent: () => import('./pages/customer-menu/customer-menu.component').then(m => m.CustomerMenuComponent) },

  // Login — only when logged out
  { path: 'login', loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent), canActivate: [loginGuard] },

  // POS — any logged-in user (admin or cashier)
  { path: 'pos', loadComponent: () => import('./pages/pos/pos.component').then(m => m.PosComponent), canActivate: [posGuard] },

  // Admin — admin role only
  { path: 'admin', loadComponent: () => import('./pages/admin/admin.component').then(m => m.AdminComponent), canActivate: [authGuard] },
];
