import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="login">
      <div class="login-card card">
        <div class="login-header">
          <span class="login-logo">☕</span>
          <h2>Admin sign in</h2>
          <p class="login-sub">The Daily Grind POS</p>
        </div>

        @if (error()) {
          <div class="alert-error">{{ error() }}</div>
        }

        <input [(ngModel)]="username" placeholder="Username" (keyup.enter)="login()" autocomplete="username" />
        <input type="password" [(ngModel)]="password" placeholder="Password" (keyup.enter)="login()" autocomplete="current-password" />

        <button class="btn btn-primary" style="width:100%;justify-content:center;padding:0.65rem;" (click)="login()" [disabled]="busy()">
          @if (busy()) { Signing in… } @else { Sign in }
        </button>
      </div>
    </div>
  `,
  styles: [`
    .login { display: flex; justify-content: center; padding-top: 4rem; }
    .login-card { padding: 2rem; width: 340px; display: flex; flex-direction: column; gap: 0.875rem; box-shadow: var(--shadow-lg); }
    .login-header { text-align: center; margin-bottom: 0.25rem; }
    .login-logo { font-size: 2.5rem; display: block; margin-bottom: 0.5rem; }
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
