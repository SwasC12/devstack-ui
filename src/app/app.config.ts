import { ApplicationConfig, APP_INITIALIZER, inject, isDevMode, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { Capacitor } from '@capacitor/core';
import { routes } from './app.routes';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideRouter(routes),
    // Service worker ONLY on the web (Vercel PWA). On the native app the APK
    // already bundles the assets, so the SW just caches an old bundle and makes
    // freshly-installed APK updates load stale code - disable it there.
    provideServiceWorker('ngsw-worker.js', { enabled: !isDevMode() && !Capacitor.isNativePlatform() }),
    {
      // Restore a session from the refresh cookie before the app renders.
      provide: APP_INITIALIZER,
      useFactory: () => {
        const auth = inject(AuthService);
        return () => auth.ensureReady();
      },
      multi: true,
    },
  ],
};
