import { Component, inject } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { NavigationStart, NavigationEnd, NavigationError, NavigationCancel } from '@angular/router';
import { filter } from 'rxjs';
import { finalize } from 'rxjs';
import { AuthService } from './auth.service';
import { AppDialogComponent } from './app-dialog.component';
import { AppLoaderComponent } from './app-loader.component';
import { LoadingService } from './loading.service';
import { AppLogoComponent } from './app-logo.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterModule, AppDialogComponent, AppLoaderComponent, AppLogoComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  auth = inject(AuthService);
  router = inject(Router);

  constructor() {
    const loading = inject(LoadingService);
    // Page switching: show the loader while a route is resolving, hide when it lands.
    this.router.events.pipe(
      filter(e => e instanceof NavigationStart || e instanceof NavigationEnd || e instanceof NavigationError || e instanceof NavigationCancel)
    ).subscribe(e => {
      if (e instanceof NavigationStart) loading.show();
      else loading.hide();
    });
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
