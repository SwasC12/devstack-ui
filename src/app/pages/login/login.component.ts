import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../auth.service';
import { Router } from '@angular/router';
import { BtnComponent } from '../../btn.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, BtnComponent],
  template: `
    <div class="login">
      <div class="login-card card">
        <div class="login-header">
          <img src="/favicon.png" alt="" class="login-logo" />
          <h2>Admin sign in</h2>
          <p class="login-sub">CoffeeShop Pro</p>
        </div>

        @if (error()) {
          <div class="alert-error">{{ error() }}</div>
        }

        <input [(ngModel)]="username" placeholder="Username" (keyup.enter)="login()" autocomplete="username" />
        <input type="password" [(ngModel)]="password" placeholder="Password" (keyup.enter)="login()" autocomplete="current-password" />

        <app-btn variant="primary" [block]="true" [loading]="busy()" (onClick)="login()">Sign in</app-btn>
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
    input { padding: 0.6rem 0.75rem; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 0.875rem; font-family: inherit; outline: none; transition: border-color 0.15s; }
    input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(181, 138, 91, 0.12); }
    .alert-error { background: var(--red-bg); color: var(--red); font-size: 0.8125rem; font-weight: 600; padding: 0.5rem 0.75rem; border-radius: var(--radius-sm); text-align: center; }
  `]
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  username = '';
  password = '';
  readonly error = signal('');
  readonly busy = signal(false);

  login() {
    if (!this.username || !this.password) return;
    this.busy.set(true);
    this.error.set('');
    this.auth.login(this.username, this.password).subscribe({
      next: () => this.router.navigate(['/admin']),
      error: () => { this.error.set('Invalid username or password'); this.busy.set(false); }
    });
  }
}
