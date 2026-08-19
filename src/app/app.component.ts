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
    // Page switching: show the loader while a route is resolving, hide when it lands.
    this.router.events.pipe(
      filter(e => e instanceof NavigationStart || e instanceof NavigationEnd || e instanceof NavigationError || e instanceof NavigationCancel)
    ).subscribe(e => {
      if (e instanceof NavigationStart) loading.show();
      else loading.hide();
    });
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => void this.updateKioskLock());
    void this.updateKioskLock();
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
  }

  ngOnDestroy() {
    if (this.kioskTimer) clearInterval(this.kioskTimer);
  }

  // Kitchen kiosk: when the kitchen tablet is locked, hide the nav so the wall
  // display stays on the kitchen screen.
  kioskLocked = signal(false);
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

  get shop() {
    return this.auth.getShop();
  }

  get isEmployee(): boolean {
    return this.auth.isLoggedIn && !this.isAdmin;
  }

  logout(): void {
    const isSuper = this.auth.getUser()?.role === 'superadmin';
    this.auth.logout()
      .pipe(finalize(() => this.router.navigate([isSuper ? '/platform' : '/login'])))
      .subscribe();
  }
}
