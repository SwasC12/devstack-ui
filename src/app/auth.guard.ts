import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

// All guards first let the auth service restore a session from the refresh
// cookie (no-op once initialized), so a hard reload keeps you where you were.

// Admin only → /admin
export const authGuard = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ensureReady();
  if (auth.getUser()?.role === 'admin') return true;
  return router.parseUrl('/menu');
};

// Any logged-in user → /pos
export const posGuard = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ensureReady();
  if (auth.isLoggedIn) return true;
  return router.parseUrl('/menu');
};

// Superadmin only → /shops
export const superAdminGuard = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ensureReady();
  if (auth.getUser()?.role === 'superadmin') return true;
  return router.parseUrl('/menu');
};

// Logged-out only → login pages
export const loginGuard = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ensureReady();
  if (!auth.isLoggedIn) return true;
  return router.parseUrl('/menu');
};
