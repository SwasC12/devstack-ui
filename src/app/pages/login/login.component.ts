import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../auth.service';
import { Router, RouterModule } from '@angular/router';
import { BtnComponent } from '../../btn.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, BtnComponent, RouterModule],
  template: `
    <div class="login">
      <div class="login-card card">
        <div class="login-header">
          <img src="/favicon.png" alt="" class="login-logo" />
          <h2>{{ platform ? 'Platform sign in' : 'Shop sign in' }}</h2>
          <p class="login-sub">{{ platform ? 'DevStack — platform owner access' : 'CoffeeShop Pro' }}</p>
        </div>

        @if (error()) {
          <div class="alert-error">{{ error() }}</div>
        }

        @if (!platform) {
          <input [(ngModel)]="shopCode" placeholder="Shop code" (keyup.enter)="login()" autocomplete="organization" />
        }
        <input [(ngModel)]="username" placeholder="Username" (keyup.enter)="login()" autocomplete="username" />
        <input type="password" [(ngModel)]="password" placeholder="Password" (keyup.enter)="login()" autocomplete="current-password" />

        <app-btn variant="primary" [block]="true" [loading]="busy()" (onClick)="login()">
          {{ platform ? 'Sign in to platform' : 'Sign in' }}
        </app-btn>

        <p class="login-alt">
          @if (platform) {
            <a routerLink="/login">Shop staff? Sign in here</a>
          } @else {
            <a routerLink="/platform">Platform owner? Sign in here</a>
          }
        </p>
      </div>
    </div>
  `,
  styles: [`
    .login { display: flex; justify-content: center; padding-top: 4rem; }
    .login-card { padding: 2rem; width: 340px; display: flex; flex-direction: column; gap: 0.875rem; box-shadow: var(--shadow-lg); }
    .login-header { text-align: center; margin-bottom: 0.25rem; }
    .login-logo { width: 64px; height: 64px; border-radius: 12px; object-fit: cover; display: block; margin: 0 auto 0.5rem; box-shadow: var(--shadow-sm); }
    .login-card h2 { margin: 0; font-size: 1.125rem; font-weight: 700; }
    .login-sub { margin: 0.25rem 0 0; font-size: 0.75rem; color: var(--muted); }
    input { padding: 0.6rem 0.75rem; border: 1px solid var(--border-hover); border-radius: var(--radius-sm); font-size: 0.875rem; font-family: inherit; color: var(--text); background: var(--surface-2); outline: none; transition: border-color 0.15s; }
    input::placeholder { color: var(--muted); }
    input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(200, 135, 56, 0.15); }
    .alert-error { background: var(--red-bg); color: var(--red); font-size: 0.8125rem; font-weight: 600; padding: 0.5rem 0.75rem; border-radius: var(--radius-sm); text-align: center; }
    .login-alt { margin: 0; text-align: center; font-size: 0.75rem; color: var(--muted); }
    .login-alt a { color: var(--accent-2); font-weight: 600; text-decoration: none; }
    .login-alt a:hover { text-decoration: underline; }
  `]
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  shopCode = '';
  username = '';
  password = '';
  readonly error = signal('');
  readonly busy = signal(false);

  // One component serves two routes: /login (shop staff) and /platform
  // (superadmin). The URL decides the mode — shop code required for staff,
  // hidden for the platform owner.
  get platform(): boolean {
    return this.router.url.startsWith('/platform');
  }

  login() {
    if (!this.username || !this.password) return;
    if (!this.platform && !this.shopCode.trim()) {
      this.error.set('Enter your shop code');
      return;
    }

    this.busy.set(true);
    this.error.set('');
    const request = this.platform
      ? this.auth.superadminLogin(this.username, this.password)
      : this.auth.login(this.shopCode, this.username, this.password);

    request.subscribe({
      next: (res) => {
        // Shop login never returns superadmin, so the role picks the page.
        const dest = this.platform ? '/shops' : res.role === 'cashier' ? '/pos' : '/admin';
        this.router.navigate([dest]);
      },
      error: (err) => {
        this.error.set(err.error?.error ?? (this.platform ? 'Invalid platform credentials' : 'Invalid shop code or credentials'));
        this.busy.set(false);
      }
    });
  }
}
