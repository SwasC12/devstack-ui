import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MenuItemService } from '../../menu-item.service';

// PUBLIC, fully ISOLATED customer loyalty page. Reached by scanning a brand's
// join QR (/join/<token>). Warm, friendly, coffee-shop styling — deliberately
// NOT the corporate app theme. A shopper can sign up (get their personal QR) or
// sign in with phone/email/code + password to see their card + stamp balance.
// Loyalty is brand-wide, so the card works at every shop of the brand.
@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <div class="j-page">
    <div class="j-card">
      @if (done(); as d) {
        <!-- ── Loyalty card ── -->
        <div class="j-hero">
          <div class="j-logo-wrap">
            @if (shop()?.logoUrl) { <img [src]="shop()!.logoUrl" alt="" class="j-logo" /> }
            @else { <span class="j-logo-fallback">☕</span> }
          </div>
          <h1 class="j-title">{{ welcomeBack() ? 'Welcome back' : 'You’re in' }}{{ d.name ? ', ' + firstName(d.name) : '' }}!</h1>
          <p class="j-shopname">{{ shop()?.name }}</p>
        </div>

        @if (d.stamps >= d.stampsRequired) {
          <div class="j-reward-ready">
            <span class="j-reward-emoji">🎉</span>
            <div><strong>Reward ready!</strong><span>Show this at the till for your {{ d.reward }}.</span></div>
          </div>
        } @else {
          <p class="j-progress">{{ d.stamps }} of {{ d.stampsRequired }} stamps · <strong>{{ d.stampsRequired - d.stamps }} to go</strong> for {{ d.reward }}</p>
        }

        <div class="j-stampcard">
          @for (filled of stampCells(d); track $index) {
            <span class="j-stamp" [class.on]="filled">{{ filled ? '★' : '' }}</span>
          }
        </div>

        @if (qr()) {
          <div class="j-qrframe">
            <img [src]="qr()" alt="Your loyalty QR" />
          </div>
        }
        <p class="j-codechip">{{ d.loyaltyCode }}</p>
        <p class="j-hint centre">Show this QR at the till — or just give your phone number — to collect stamps at any of our shops.</p>

        <button class="j-ghost" (click)="showAddHome.set(!showAddHome())">📲 Add my card to home screen</button>
        @if (showAddHome()) {
          <p class="j-tip">
            @if (isIos) { Tap the <strong>Share</strong> icon, then <strong>Add to Home Screen</strong>. }
            @else { Open the browser menu <strong>⋮</strong>, then <strong>Add to Home screen</strong>. }
            One tap next time — no link to find.
          </p>
        }
        <button class="j-textlink" (click)="signOut()">Sign out</button>

      } @else if (loading()) {
        <div class="j-loading"><span class="j-spinner"></span><p>Loading…</p></div>

      } @else if (notFound()) {
        <div class="j-hero"><span class="j-logo-fallback">🔍</span><h1 class="j-title">Shop not found</h1></div>
        <p class="j-hint centre">This link doesn’t match an active shop. Please check the QR code with the shop.</p>

      } @else if (!shop()?.loyaltyEnabled) {
        <div class="j-hero">
          <div class="j-logo-wrap">@if (shop()?.logoUrl) { <img [src]="shop()!.logoUrl" alt="" class="j-logo" /> } @else { <span class="j-logo-fallback">☕</span> }</div>
          <h1 class="j-title">{{ shop()?.name }}</h1>
        </div>
        <p class="j-hint centre">There’s no loyalty programme running here right now. Check back soon!</p>

      } @else if (mode() === 'member') {
        <!-- ── Sign in ── -->
        <div class="j-hero">
          <div class="j-logo-wrap">@if (shop()?.logoUrl) { <img [src]="shop()!.logoUrl" alt="" class="j-logo" /> } @else { <span class="j-logo-fallback">☕</span> }</div>
          <h1 class="j-title">Welcome back</h1>
          <p class="j-shopname">{{ shop()?.name }}</p>
        </div>
        <p class="j-hint centre">Sign in to see your stamps.</p>
        <label class="j-field"><span>Phone, email or code</span><input [(ngModel)]="lookup" autocomplete="off" /></label>
        <label class="j-field"><span>Password</span><input [(ngModel)]="loginPassword" type="password" autocomplete="current-password" /></label>
        @if (err()) { <p class="j-err">{{ err() }}</p> }
        <button class="j-primary" [disabled]="busy()" (click)="checkPoints()">{{ busy() ? 'Checking…' : 'View my points' }}</button>
        <button class="j-textlink" (click)="setMode('signup')">New here? Join the programme</button>

      } @else {
        <!-- ── Sign up ── -->
        <div class="j-hero">
          <div class="j-logo-wrap">@if (shop()?.logoUrl) { <img [src]="shop()!.logoUrl" alt="" class="j-logo" /> } @else { <span class="j-logo-fallback">☕</span> }</div>
          <h1 class="j-title">{{ shop()?.name }}</h1>
          <p class="j-shopname">Loyalty programme</p>
        </div>
        <div class="j-rewardbanner"><span>★</span> Collect {{ shop()?.loyaltyStampsRequired }} stamps → <strong>{{ shop()?.loyaltyReward }}</strong></div>

        <label class="j-field"><span>Your name</span><input [(ngModel)]="name" autocomplete="name" /></label>
        <label class="j-field"><span>Phone number</span><input [(ngModel)]="phone" type="tel" inputmode="tel" autocomplete="tel" /></label>
        <label class="j-field"><span>Email <em>(optional)</em></span><input [(ngModel)]="email" type="email" inputmode="email" autocomplete="email" /></label>
        <label class="j-field"><span>Create a password</span><input [(ngModel)]="password" type="password" autocomplete="new-password" /><small>At least 6 characters — to check your points later.</small></label>
        <label class="j-check"><input type="checkbox" [(ngModel)]="consent" /> <span>I agree to {{ shop()?.name }} storing my details for their loyalty programme and contacting me about it. I can ask them to remove my details anytime.</span></label>
        @if (err()) { <p class="j-err">{{ err() }}</p> }
        <button class="j-primary" [disabled]="busy()" (click)="submit()">{{ busy() ? 'Joining…' : 'Join now' }}</button>
        <button class="j-textlink" (click)="setMode('member')">Already a member? Check my points</button>
      }
    </div>
    <p class="j-foot">Powered by CoffeeShop Pro</p>
  </div>
  `,
  styles: [`
    /* Warm, inviting coffee-shop palette — deliberately its own theme, not the app's */
    :host {
      display:block; min-height:100dvh;
      --cream-1:#f7f0e6; --cream-2:#ecdcc6;
      --card:#fffdf9; --ink:#3a2c23; --muted:#9a8574;
      --accent:#bd7a3c; --accent-dark:#9c6330; --accent-soft:#f4e6d4; --line:#ecdcca;
      background:linear-gradient(160deg, var(--cream-1) 0%, var(--cream-2) 100%);
      color:var(--ink); font-family:'Segoe UI', -apple-system, Roboto, Helvetica, Arial, sans-serif;
    }
    .j-page { min-height:100dvh; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:1.25rem; gap:.9rem; }
    .j-card { width:min(420px,100%); background:var(--card); border-radius:1.6rem; padding:1.8rem 1.5rem;
      box-shadow:0 18px 50px rgba(80,50,20,.16); border:1px solid rgba(255,255,255,.7); }

    .j-hero { text-align:center; margin-bottom:1rem; }
    .j-logo-wrap { width:88px; height:88px; margin:0 auto .7rem; border-radius:50%; background:var(--accent-soft);
      display:flex; align-items:center; justify-content:center; box-shadow:0 6px 18px rgba(189,122,60,.22); overflow:hidden; }
    .j-logo { width:100%; height:100%; object-fit:cover; }
    .j-logo-fallback { font-size:2.4rem; line-height:1; }
    .j-title { font-size:1.6rem; font-weight:800; margin:.1rem 0; letter-spacing:-.02em; line-height:1.15; }
    .j-shopname { color:var(--muted); font-size:1rem; margin:.1rem 0 0; font-weight:600; }

    .j-progress { text-align:center; color:var(--ink); font-size:.95rem; margin:.4rem 0 1rem; }
    .j-progress strong { color:var(--accent-dark); }

    .j-reward-ready { display:flex; align-items:center; gap:.7rem;
      background:var(--accent-soft); border:1px dashed var(--accent); border-radius:1rem; padding:.8rem 1rem; margin:.4rem 0 1rem; }
    .j-reward-emoji { font-size:1.7rem; }
    .j-reward-ready strong { display:block; color:var(--accent-dark); }
    .j-reward-ready span { font-size:.85rem; color:var(--ink); }

    /* Stamp card — the delightful bit */
    .j-stampcard { display:grid; grid-template-columns:repeat(5,1fr); gap:.55rem; margin:.4rem 0 1.2rem; }
    .j-stamp { aspect-ratio:1; border-radius:50%; border:2px dashed var(--line); display:flex; align-items:center; justify-content:center;
      color:#fff; font-size:1.1rem; background:#faf5ec; transition:transform .15s; }
    .j-stamp.on { background:var(--accent); border:2px solid var(--accent); box-shadow:0 3px 8px rgba(189,122,60,.3); }

    .j-qrframe { display:flex; justify-content:center; margin:.4rem 0 .8rem; }
    .j-qrframe img { width:210px; height:210px; padding:12px; background:#fff; border-radius:1rem; box-shadow:0 4px 16px rgba(80,50,20,.12); }
    .j-codechip { text-align:center; font-family:'Courier New',monospace; font-weight:700; letter-spacing:.18em; font-size:1.05rem;
      background:var(--accent-soft); color:var(--accent-dark); border-radius:.6rem; padding:.4rem; margin:.2rem auto .6rem; width:fit-content; }

    .j-rewardbanner { display:flex; align-items:center; justify-content:center; gap:.4rem; text-align:center;
      background:var(--accent-soft); color:var(--accent-dark); border-radius:1rem; padding:.7rem 1rem; margin-bottom:1.1rem; font-size:.95rem; }
    .j-rewardbanner span { font-size:1.1rem; }

    .j-field { display:block; margin:.7rem 0; }
    .j-field > span { display:block; font-size:.78rem; font-weight:700; color:var(--muted); margin-bottom:.3rem; }
    .j-field em { font-weight:500; text-transform:none; opacity:.8; }
    .j-field input { width:100%; box-sizing:border-box; padding:.85rem .95rem; border:1.5px solid var(--line); border-radius:.85rem;
      background:#fffdfa; color:var(--ink); font-family:inherit; font-size:1rem; outline:none; transition:border-color .15s; }
    .j-field input:focus { border-color:var(--accent); }
    .j-field small { display:block; font-size:.72rem; color:var(--muted); margin-top:.3rem; }

    .j-check { display:flex; gap:.6rem; align-items:flex-start; margin:1rem 0; font-size:.8rem; color:var(--muted); line-height:1.45; cursor:pointer; }
    .j-check input { width:20px; height:20px; margin-top:1px; flex:0 0 auto; accent-color:var(--accent); }

    .j-primary { width:100%; padding:1rem; border:0; border-radius:.95rem; margin-top:.5rem; cursor:pointer;
      background:linear-gradient(135deg, var(--accent), var(--accent-dark)); color:#fff; font-family:inherit; font-size:1.05rem; font-weight:800;
      box-shadow:0 8px 20px rgba(189,122,60,.35); transition:transform .12s, box-shadow .12s; }
    .j-primary:active { transform:translateY(1px); box-shadow:0 4px 12px rgba(189,122,60,.3); }
    .j-primary:disabled { opacity:.65; }

    .j-ghost { width:100%; padding:.75rem; border:1.5px solid var(--line); border-radius:.85rem; margin-top:.9rem; cursor:pointer;
      background:#fffdfa; color:var(--ink); font-family:inherit; font-size:.92rem; font-weight:600; }
    .j-textlink { display:block; width:100%; margin-top:.9rem; background:none; border:0; color:var(--accent-dark);
      font-family:inherit; font-size:.9rem; font-weight:600; cursor:pointer; }
    .j-textlink:hover { text-decoration:underline; }

    .j-hint { color:var(--muted); font-size:.9rem; line-height:1.5; margin:.4rem 0; }
    .j-hint.centre { text-align:center; }
    .j-tip { background:#fffdfa; border:1px solid var(--line); border-radius:.7rem; padding:.7rem .85rem; font-size:.82rem; color:var(--ink); margin-top:.6rem; }
    .j-err { color:#c0392b; font-size:.85rem; font-weight:600; margin:.5rem 0; text-align:center; }

    .j-loading { text-align:center; padding:2rem 0; color:var(--muted); }
    .j-spinner { width:32px; height:32px; border:3px solid var(--line); border-top-color:var(--accent); border-radius:50%;
      display:inline-block; animation:spin .7s linear infinite; margin-bottom:.6rem; }
    @keyframes spin { to { transform:rotate(360deg); } }

    .j-foot { color:var(--muted); font-size:.7rem; opacity:.7; }
  `],
})
export class SignupComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private service = inject(MenuItemService);

  private code = '';
  readonly loading = signal(true);
  readonly notFound = signal(false);
  readonly shop = signal<any | null>(null);
  readonly busy = signal(false);
  readonly err = signal('');
  readonly done = signal<any | null>(null);
  readonly qr = signal<string>('');
  readonly mode = signal<'signup' | 'member'>('signup');
  readonly welcomeBack = signal(false);
  readonly showAddHome = signal(false);
  get isIos(): boolean { return /iphone|ipad|ipod/i.test(navigator.userAgent); }

  name = ''; phone = ''; email = ''; consent = false; password = '';
  lookup = ''; loginPassword = '';

  firstName(n: string): string { return (n || '').trim().split(/\s+/)[0]; }

  // Booleans for the stamp-card cells: first N filled, capped at the target.
  stampCells(d: any): boolean[] {
    const req = Math.max(0, d?.stampsRequired ?? 0);
    const have = Math.min(Math.max(0, d?.stamps ?? 0), req);
    return Array.from({ length: req }, (_, i) => i < have);
  }

  // Per-shop key so a stored session only ever restores the right shop's card.
  private get storeKey() { return `loy_member_${this.code}`; }

  ngOnInit() {
    this.code = this.route.snapshot.paramMap.get('code') ?? '';
    if (!this.code) { this.loading.set(false); this.notFound.set(true); return; }
    this.service.getPublicShop(this.code).subscribe({
      next: s => {
        this.shop.set(s);
        // Stay signed in across refreshes: if we saved this shopper's loyalty
        // code, silently reload their card instead of showing "join" again.
        const saved = this.readSaved();
        if (s?.loyaltyEnabled && saved) {
          this.service.publicMemberResume(this.code, saved).subscribe({
            next: (res) => { this.loading.set(false); this.welcomeBack.set(true); void this.showCard(res); },
            error: () => { this.clearSaved(); this.loading.set(false); }, // card gone → fall back to join
          });
        } else {
          this.loading.set(false);
        }
      },
      error: () => { this.loading.set(false); this.notFound.set(true); },
    });
  }

  private readSaved(): string | null { try { return localStorage.getItem(this.storeKey); } catch { return null; } }
  private writeSaved(code: string) { try { localStorage.setItem(this.storeKey, code); } catch { /* private mode */ } }
  private clearSaved() { try { localStorage.removeItem(this.storeKey); } catch { /* ignore */ } }

  setMode(m: 'signup' | 'member') { this.err.set(''); this.mode.set(m); }

  // Explicit sign-out from the card: forget this device and return to join.
  signOut() {
    this.clearSaved();
    this.done.set(null); this.qr.set(''); this.err.set(''); this.welcomeBack.set(false);
    this.name = ''; this.phone = ''; this.email = ''; this.consent = false; this.password = '';
    this.lookup = ''; this.loginPassword = '';
    this.mode.set('signup');
  }

  private async showCard(res: any) {
    this.done.set(res);
    if (res?.loyaltyCode) this.writeSaved(res.loyaltyCode); // remember for refresh
    try {
      const QRCode = (await import('qrcode')).default ?? (await import('qrcode'));
      this.qr.set(await (QRCode as any).toDataURL(`LOY:${res.loyaltyCode}`, { width: 440, margin: 1 }));
    } catch { /* QR lib unavailable - the code text is still shown */ }
  }

  // ── validation ──
  private validEmail(e: string): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
  private validPhone(p: string): boolean { const d = p.replace(/[\s-]/g, ''); return /^\+?\d{10,13}$/.test(d); }

  submit() {
    this.err.set('');
    const name = this.name.trim(), phone = this.phone.trim(), email = this.email.trim();
    if (!name) { this.err.set('Please enter your name.'); return; }
    if (!phone && !email) { this.err.set('Please give a phone number or email.'); return; }
    if (phone && !this.validPhone(phone)) { this.err.set('Please enter a valid phone number.'); return; }
    if (email && !this.validEmail(email)) { this.err.set('Please enter a valid email address.'); return; }
    if (this.password.length < 6) { this.err.set('Please set a password of at least 6 characters.'); return; }
    if (!this.consent) { this.err.set('Please tick the box to join.'); return; }
    this.busy.set(true);
    this.service.publicSignup(this.code, { name, phone: phone || null, email: email || null, consent: this.consent, password: this.password }).subscribe({
      next: (res) => { this.busy.set(false); this.welcomeBack.set(false); void this.showCard(res); },
      error: (e) => { this.busy.set(false); this.err.set(e.error?.error || 'Could not sign you up. Please try again.'); },
    });
  }

  checkPoints() {
    this.err.set('');
    if (!this.lookup.trim()) { this.err.set('Enter your phone, email or code.'); return; }
    if (!this.loginPassword) { this.err.set('Enter your password.'); return; }
    this.busy.set(true);
    this.service.publicMemberLookup(this.code, this.lookup.trim(), this.loginPassword).subscribe({
      next: (res) => { this.busy.set(false); this.welcomeBack.set(true); void this.showCard(res); },
      error: (e) => { this.busy.set(false); this.err.set(e.error?.error || 'No card found. Please sign up.'); },
    });
  }
}
