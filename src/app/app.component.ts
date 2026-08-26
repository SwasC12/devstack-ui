import { Component, inject, NgZone, OnDestroy, signal } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { NavigationStart, NavigationEnd, NavigationError, NavigationCancel } from '@angular/router';
import { filter } from 'rxjs';
import { finalize } from 'rxjs';
import { AuthService } from './auth.service';
import { AppDialogComponent } from './app-dialog.component';
import { AppLoaderComponent } from './app-loader.component';
import { LoadingService } from './loading.service';
import { AppLogoComponent } from './app-logo.component';
import { ClockComponent } from './clock.component';
import { OfflineService } from './offline.service';
import { SwUpdate } from '@angular/service-worker';
import { Preferences } from '@capacitor/preferences';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterModule, AppDialogComponent, AppLoaderComponent, AppLogoComponent, ClockComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnDestroy {
  auth = inject(AuthService);
  router = inject(Router);
  offline = inject(OfflineService);
  private zone = inject(NgZone);
  private kioskTimer: any = null;

  constructor() {
    const loading = inject(LoadingService);

    // Web PWA only: when the service worker has a new version ready, activate it
    // and reload, so the browser never keeps serving a stale bundle (which is
    // what makes "my fix didn't apply" bugs on the web). Native has the SW
    // disabled entirely, so isEnabled is false there and this is a no-op.
    const swUpdate = inject(SwUpdate);
    if (swUpdate.isEnabled) {
      swUpdate.versionUpdates.subscribe(e => {
        if (e.type === 'VERSION_READY') {
          void swUpdate.activateUpdate().then(() => location.reload());
        }
      });
    }

    // Page switching: show the loader while a route is resolving, hide when it lands.
    this.router.events.pipe(
      filter(e => e instanceof NavigationStart || e instanceof NavigationEnd || e instanceof NavigationError || e instanceof NavigationCancel)
    ).subscribe(e => {
      if (e instanceof NavigationStart) loading.show();
      else loading.hide();
    });
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => { void this.updateKioskLock(); this.updatePublicPage(); });
    void this.updateKioskLock();
    this.updatePublicPage();
    // The kiosk pref lives in device storage and only the kitchen page changes
    // it - poll so the nav hides/shows instantly instead of waiting for the
    // next navigation (which the locked nav otherwise prevents).
    // Run OUTSIDE the Angular zone: this used to fire a full app-wide change
    // detection ~1.4x/second forever (on every page), which made the whole app
    // - especially the POS grid - churn needlessly. Now the tick does nothing
    // but a cheap URL check unless we're on /kitchen, and only re-enters the
    // zone when the lock state actually changes.
    this.zone.runOutsideAngular(() => {
      this.kioskTimer = setInterval(() => {
        if (!this.router.url.startsWith('/kitchen')) return;
        void this.updateKioskLock();
      }, 700);
    });

    // Retry any queued offline orders when a POS session opens the app and when
    // it returns to the foreground. The OfflineService only auto-flushed on an
    // offline->online transition, so an order queued in a previous run could sit
    // "awaiting sync" forever on a cold start that was already online. Gated on a
    // POS (shop) session so a superadmin never tries to post a shop's order.
    this.maybeFlushQueue();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.maybeFlushQueue();
    });
  }

  private maybeFlushQueue(): void {
    if (this.isPosSession && navigator.onLine) void this.offline.flush();
  }

  ngOnDestroy() {
    if (this.kioskTimer) clearInterval(this.kioskTimer);
  }

  // Kitchen kiosk: when the kitchen tablet is locked, hide the nav so the wall
  // display stays on the kitchen screen.
  kioskLocked = signal(false);

  // Public customer loyalty page (/join/:token) is a fully ISOLATED page: no
  // top bar, brand, POS/Kitchen/Admin nav or sign-in link — nothing that could
  // let a shopper reach the actual POS. Just the signup/points card.
  //
  // Seeded SYNCHRONOUSLY from the real URL so the very first paint already knows
  // it's a public page — otherwise the nav flashes (and, on a hard reload such
  // as toggling "Desktop site", stays) before the first NavigationEnd flips it.
  publicPage = signal(this.isPublicUrl(location?.pathname ?? ''));
  private isPublicUrl(url: string): boolean { return url.startsWith('/join'); }
  private updatePublicPage(): void {
    const isPublic = this.isPublicUrl(this.router.url) || this.isPublicUrl(location?.pathname ?? '');
    if (isPublic !== this.publicPage()) this.publicPage.set(isPublic);
  }
  private async updateKioskLock(): Promise<void> {
    if (!this.router.url.startsWith('/kitchen')) {
      if (this.kioskLocked()) this.zone.run(() => this.kioskLocked.set(false));
      return;
    }
    const { value } = await Preferences.get({ key: 'kiosk' });
    const locked = value === '1';
    // Only re-enter the zone (and trigger CD) when the state actually changes.
    if (locked !== this.kioskLocked()) this.zone.run(() => this.kioskLocked.set(locked));
  }

  get isAdmin(): boolean {
    return this.auth.getUser()?.role === 'admin';
  }

  get isSuperAdmin(): boolean {
    return this.auth.getUser()?.role === 'superadmin';
  }

  get isManager(): boolean {
    return this.auth.getUser()?.role === 'manager';
  }

  // Who sees the Admin nav link / can reach /admin: admins and managers.
  get canAccessAdmin(): boolean {
    return this.isAdmin || this.isManager;
  }

  // The offline ORDER queue belongs to a POS (shop) session. A superadmin on
  // the platform pages has no shop scope, so a queued shop order can't sync
  // under their auth — don't show them the "awaiting sync" banner (and don't
  // try to flush it under a superadmin session). Shop admins, managers +
  // cashiers do.
  get isPosSession(): boolean {
    const role = this.auth.getUser()?.role;
    return role === 'admin' || role === 'manager' || role === 'cashier';
  }

  get shop() {
    return this.auth.getShop();
  }

  get isEmployee(): boolean {
    return this.auth.isLoggedIn && !this.isAdmin;
  }

  exitImpersonation(): void {
    this.auth.exitImpersonation();
    this.router.navigateByUrl('/shops');
  }

  logout(): void {
    const isSuper = this.auth.getUser()?.role === 'superadmin';
    this.auth.logout()
      .pipe(finalize(() => this.router.navigate([isSuper ? '/platform' : '/login'])))
      .subscribe();
  }
}
