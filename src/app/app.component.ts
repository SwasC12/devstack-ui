import { Component, inject, signal } from '@angular/core';
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
export class AppComponent {
  auth = inject(AuthService);
  router = inject(Router);
  offline = inject(OfflineService);

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
  }

  // Kitchen kiosk: when the kitchen tablet is locked, hide the nav so the wall
  // display stays on the kitchen screen.
  kioskLocked = signal(false);
  private async updateKioskLock(): Promise<void> {
    const { value } = await Preferences.get({ key: 'kiosk' });
    this.kioskLocked.set(value === '1' && this.router.url.startsWith('/kitchen'));
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
