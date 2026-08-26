import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { catchError, finalize, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { LoadingService } from './loading.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const loading = inject(LoadingService);
  const isApi = req.url.includes('/api/');
  const isRefresh = req.url.includes('/auth/refresh');
  // Background calls (kitchen polls, etc.) never show the full-screen loader.
  const isBackground = req.headers.has('X-Background');

  // Every API call carries the refresh cookie; authenticated calls add the
  // in-memory access token as a Bearer header.
  let clone = req;
  if (isApi) {
    clone = clone.clone({ withCredentials: true });
    // Tell the API this is the Capacitor app so auth responses include the
    // raw refresh token for device storage.
    if (Capacitor.isNativePlatform()) clone = clone.clone({ setHeaders: { 'X-Client': 'native' } });
    if (auth.token) clone = clone.clone({ setHeaders: { Authorization: `Bearer ${auth.token}` } });
  }

  // Global loader: counter-based, so concurrent calls stay visible together.
  // Background requests (e.g. the kitchen tablet's safety-net poll) stay silent.
  if (isApi && !isBackground) loading.show();

  return next(clone).pipe(
    finalize(() => { if (isApi && !isBackground) loading.hide(); }),
    catchError(err => {
      // Impersonation session expired: don't refresh (the cookie is the
      // superadmin's) — drop back to the platform as the superadmin.
      if (err.status === 401 && isApi && !isRefresh && auth.impersonating) {
        auth.exitImpersonation();
        router.navigateByUrl('/shops');
        return throwError(() => err);
      }
      // Access token expired → try one refresh, then replay the request.
      if (err.status === 401 && isApi && !isRefresh && auth.token) {
        return auth.refresh().pipe(
          switchMap(res => next(clone.clone({ setHeaders: { Authorization: `Bearer ${res.token}` } }))),
          catchError(() => {
            const wasSuper = auth.getUser()?.role === 'superadmin';
            auth.clearSession();
            router.navigateByUrl(wasSuper ? '/platform' : '/login');
            return throwError(() => err);
          })
        );
      }
      return throwError(() => err);
    })
  );
};
