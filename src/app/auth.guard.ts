import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

// All guards first let the auth service restore a session from the refresh
// cookie (no-op once initialized), so a hard reload keeps you where you were.
// Denied users go to the login page (there is no public menu anymore).

// Admin + manager → /admin (managers get an operational subset; the admin-only
// sections — Users, Settings, Audit, Timesheet — are hidden inside the page).
export const authGuard = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ensureReady();
  const role = auth.getUser()?.role;
  if (role === 'admin' || role === 'manager') return true;
  return router.parseUrl('/login');
};

// Any logged-in user → /pos
export const posGuard = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ensureReady();
  if (auth.isLoggedIn) return true;
  return router.parseUrl('/login');
};

// Superadmin only → /shops
export const superAdminGuard = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ensureReady();
  if (auth.getUser()?.role === 'superadmin') return true;
  return router.parseUrl('/login');
};

// Logged-out only → login pages
export const loginGuard = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ensureReady();
  if (!auth.isLoggedIn) return true;
  return router.parseUrl('/pos');
};
