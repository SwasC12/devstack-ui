import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService, StaffMember } from '../../auth.service';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { BtnComponent } from '../../btn.component';
import { PasswordInputComponent } from '../../password-input.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, BtnComponent, RouterModule, PasswordInputComponent],
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

        @if (platform) {
          <!-- Platform owner: no shop code, private URL -->
          <input [(ngModel)]="username" placeholder="Username" (keyup.enter)="login()" autocomplete="username" />
          <app-password [(ngModel)]="password" placeholder="Password" autocomplete="current-password" (enter)="login()" />
          <app-btn variant="primary" [block]="true" [loading]="busy()" (onClick)="login()">Sign in to platform</app-btn>
          <p class="login-alt"><a routerLink="/login">Shop staff? Sign in here</a></p>
        } @else if (!pinMode()) {
          <!-- Shop staff, password -->
          <input [(ngModel)]="shopCode" placeholder="Shop code" (keyup.enter)="login()" autocomplete="organization" />
          <input [(ngModel)]="username" placeholder="Username" (keyup.enter)="login()" autocomplete="username" />
          <app-password [(ngModel)]="password" placeholder="Password" autocomplete="current-password" (enter)="login()" />
          <app-btn variant="primary" [block]="true" [loading]="busy()" (onClick)="login()">Sign in</app-btn>
          <button class="link-btn" (click)="enablePin()">Use PIN sign-in</button>
        } @else if (!staffList()) {
          <!-- PIN flow: shop code first -->
          <h3 class="step-title">PIN sign-in</h3>
          <p class="step-sub">Enter your shop code</p>
          <input [(ngModel)]="shopCode" placeholder="Shop code" (keyup.enter)="loadStaff()" autocomplete="organization" />
          <app-btn variant="primary" [block]="true" [loading]="pinBusy()" (onClick)="loadStaff()">Continue</app-btn>
          <button class="link-btn" (click)="exitPin()">Back to password</button>
        } @else if (!pinUser()) {
          <!-- PIN flow: pick your name -->
          <h3 class="step-title">Who are you?</h3>
          <div class="staff-list">
            @for (m of staffList()!; track m.id) {
              <button class="staff-btn" (click)="selectStaff(m)">
                <span class="staff-avatar">{{ m.displayName.charAt(0) }}</span>
                <span class="staff-name">{{ m.displayName }}</span>
                <span class="staff-role">{{ m.role }}</span>
              </button>
            } @empty {
              <p class="step-sub">No staff yet — an owner needs to add staff and set a PIN.</p>
            }
          </div>
          <button class="link-btn" (click)="exitPin()">Back to password</button>
        } @else {
          <!-- PIN flow: enter PIN -->
          <h3 class="step-title">Enter your PIN</h3>
          <p class="step-sub">{{ pinUser()?.displayName }}</p>
          <app-password [pin]="true" [(ngModel)]="pin" placeholder="••••" inputmode="numeric" [maxlength]="6" (enter)="pinLogin()" />
          <app-btn variant="primary" [block]="true" [loading]="pinBusy()" (onClick)="pinLogin()">Sign in</app-btn>
          <button class="link-btn" (click)="pinUser.set(null); pin = ''">Not you?</button>
        }
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
    .link-btn { border: 0; background: transparent; color: var(--accent-2); font-family: inherit; font-size: 0.8125rem; font-weight: 600; cursor: pointer; padding: 0.25rem; }
    .link-btn:hover { text-decoration: underline; }
    .step-title { margin: 0; font-size: 0.9375rem; font-weight: 700; text-align: center; }
    .step-sub { margin: 0 0 0.25rem; font-size: 0.75rem; color: var(--muted); text-align: center; }
    .staff-list { display: flex; flex-direction: column; gap: 0.5rem; max-height: 240px; overflow-y: auto; }
    .staff-btn { display: flex; align-items: center; gap: 0.75rem; padding: 0.6rem 0.85rem; border: 1px solid var(--border-hover); border-radius: var(--radius-sm); background: var(--surface-2); color: var(--text); font-family: inherit; cursor: pointer; transition: all 0.15s ease-out; }
    .staff-btn:hover { border-color: var(--accent); background: var(--surface-3); }
    .staff-avatar { width: 34px; height: 34px; border-radius: 50%; background: var(--accent-light); color: var(--accent-hover); font-weight: 800; display: flex; align-items: center; justify-content: center; font-size: 0.9375rem; flex-shrink: 0; }
    .staff-name { font-weight: 600; font-size: 0.875rem; flex: 1; text-align: left; }
    .staff-role { font-size: 0.6875rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
  `]
})
export class LoginComponent implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  shopCode = '';
  username = '';
  password = '';
  readonly error = signal('');
  readonly busy = signal(false);

  // PIN sign-in (shop staff only)
  readonly pinMode = signal(false);
  readonly staffList = signal<StaffMember[] | null>(null);
  readonly pinUser = signal<StaffMember | null>(null);
  readonly pinBusy = signal(false);
  pin = '';

  ngOnInit() {
    // Shift handover lands here with ?pin=1 — skip straight to PIN sign-in.
    this.route.queryParamMap.subscribe(p => {
      if (p.get('pin') === '1' && !this.platform) this.enablePin();
    });
  }

  // One component serves two routes: /login (shop staff) and /platform
  // (superadmin). The URL decides the mode.
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

  // ── PIN flow ──────────────────────────────────────────────

  enablePin() { this.pinMode.set(true); this.error.set(''); }
  exitPin() { this.pinMode.set(false); this.staffList.set(null); this.pinUser.set(null); this.pin = ''; this.error.set(''); }

  loadStaff() {
    if (!this.shopCode.trim()) { this.error.set('Enter your shop code'); return; }
    this.pinBusy.set(true); this.error.set('');
    this.auth.getStaff(this.shopCode.trim()).subscribe({
      next: (list) => { this.staffList.set(list); this.pinBusy.set(false); },
      error: (e) => { this.error.set(e.error?.error ?? 'Shop not found'); this.pinBusy.set(false); }
    });
  }

  selectStaff(m: StaffMember) { this.pinUser.set(m); this.pin = ''; this.error.set(''); }

  pinLogin() {
    const user = this.pinUser();
    if (!user || this.pin.length < 4) { this.error.set('Enter your PIN'); return; }
    this.pinBusy.set(true); this.error.set('');
    this.auth.pinLogin(this.shopCode.trim(), user.id, this.pin).subscribe({
      next: (res) => { this.router.navigate([res.role === 'cashier' ? '/pos' : '/admin']); },
      error: (e) => { this.error.set(e.error?.error ?? 'Invalid PIN'); this.pin = ''; this.pinBusy.set(false); }
    });
  }
}
