import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService, StaffMember } from '../../auth.service';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { BtnComponent } from '../../btn.component';
import { PasswordInputComponent } from '../../password-input.component';
import { AppLogoComponent } from '../../app-logo.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, BtnComponent, RouterModule, PasswordInputComponent, AppLogoComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
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
    // Shift handover lands here with ?pin=1&shop=CODE — skip straight to PIN
    // sign-in AND past the shop-code step (the code came with us).
    this.route.queryParamMap.subscribe(p => {
      if (p.get('pin') === '1' && !this.platform) {
        this.enablePin();
        const code = p.get('shop') ?? this.auth.getShop()?.code;
        if (code) {
          this.shopCode = code;
          this.loadStaff(); // auto-fetch staff list, no code entry
        }
      }
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
