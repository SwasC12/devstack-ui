import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

// Admin only → /admin
export const authGuard = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.getUser()?.role === 'admin') return true;
  return router.parseUrl('/menu');
};

// Any logged-in user → /pos
export const posGuard = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isLoggedIn) return true;
  return router.parseUrl('/menu');
};

// Logged-out only → /login
export const loginGuard = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isLoggedIn) return true;
  return router.parseUrl('/menu');
};
