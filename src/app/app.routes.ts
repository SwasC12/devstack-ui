import { Routes } from '@angular/router';
import { authGuard, posGuard, loginGuard, superAdminGuard } from './auth.guard';

export const routes: Routes = [
  // No public menu — the app is a shop tool. Signed-in users land on the POS.
  { path: '', redirectTo: '/pos', pathMatch: 'full' },

  // Public customer loyalty signup — scanned from a shop's join QR. No guard
  // (shoppers aren't logged in). URL: /join/<storeCode>.
  { path: 'join/:code', loadComponent: () => import('./pages/signup/signup.component').then(m => m.SignupComponent) },

  // Login — only when logged out
  { path: 'login', loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent), canActivate: [loginGuard] },

  // Platform login — same component, no shop code (superadmin only)
  { path: 'platform', loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent), canActivate: [loginGuard] },

  // POS - any logged-in user (admin or cashier)
  { path: 'pos', loadComponent: () => import('./pages/pos/pos.component').then(m => m.PosComponent), canActivate: [posGuard] },

  // Kitchen display - any logged-in user; a second tablet shows the live queue
  { path: 'kitchen', loadComponent: () => import('./pages/kitchen/kitchen.component').then(m => m.KitchenComponent), canActivate: [posGuard] },

  // Admin — admin role only
  { path: 'admin', loadComponent: () => import('./pages/admin/admin.component').then(m => m.AdminComponent), canActivate: [authGuard] },

  // Shops — superadmin role only
  { path: 'shops', loadComponent: () => import('./pages/shops/shops.component').then(m => m.ShopsComponent), canActivate: [superAdminGuard] },
];
