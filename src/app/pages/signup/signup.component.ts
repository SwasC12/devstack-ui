import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MenuItemService } from '../../menu-item.service';

// PUBLIC, fully ISOLATED customer loyalty page. Reached by scanning a shop's
// join QR, which opens /join/<JOIN-TOKEN> (a random per-shop token, never the
// staff login code). No nav, no link back to the POS. A shopper can sign up
// (get their personal loyalty QR, encodes LOY:<code>) OR sign in with their
// phone / code to view their existing card + stamp balance.
@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <div class="join-wrap">
    <div class="join-card">
      @if (done(); as d) {
        <!-- Loyalty card: personal QR + stamp balance (fresh signup or sign-in) -->
        <div class="j-brand">
          @if (shop()?.logoUrl) { <img [src]="shop()!.logoUrl" alt="" class="j-logo" /> }
          <h1>{{ welcomeBack() ? 'Welcome back' : "You're in" }}{{ d.name ? ', ' + d.name : '' }}! 🎉</h1>
        </div>
        <p class="j-muted">{{ shop()?.name }} loyalty — collect {{ d.stampsRequired }} stamps for: <strong>{{ d.reward }}</strong></p>
        <div class="j-stamps">{{ d.stamps }} / {{ d.stampsRequired }} stamps</div>
        @if (qr()) {
          <div class="j-qr"><img [src]="qr()" alt="Your loyalty QR" /></div>
        }
        <p class="j-code">Your code: <strong>{{ d.loyaltyCode }}</strong></p>
        <p class="j-muted">Show this QR (screenshot it!) or give your phone number at the till to collect stamps.</p>
        <button class="j-link" (click)="reset()">Back</button>
      } @else if (loading()) {
        <p class="j-muted">Loading…</p>
      } @else if (notFound()) {
        <h1>Shop not found</h1>
        <p class="j-muted">This join link doesn't match an active shop. Check the QR code with the shop.</p>
      } @else if (!shop()?.loyaltyEnabled) {
        <div class="j-brand">
          @if (shop()?.logoUrl) { <img [src]="shop()!.logoUrl" alt="" class="j-logo" /> }
          <h1>{{ shop()?.name }}</h1>
        </div>
        <p class="j-muted">This shop doesn't have a loyalty programme running right now.</p>
      } @else if (mode() === 'member') {
        <!-- Returning customer: view my card -->
        <div class="j-brand">
          @if (shop()?.logoUrl) { <img [src]="shop()!.logoUrl" alt="" class="j-logo" /> }
          <h1>My loyalty card</h1>
        </div>
        <p class="j-muted">Enter the phone number or code you signed up with at {{ shop()?.name }}.</p>
        <div class="j-field"><label>Phone number or code</label><input [(ngModel)]="lookup" placeholder="082 123 4567 or ABCD1234" autocomplete="tel" /></div>
        @if (err()) { <p class="j-err">{{ err() }}</p> }
        <button class="j-btn" [disabled]="busy()" (click)="checkPoints()">{{ busy() ? 'Checking…' : 'View my points' }}</button>
        <button class="j-link" (click)="setMode('signup')">New here? Sign up</button>
      } @else {
        <!-- Signup form -->
        <div class="j-brand">
          @if (shop()?.logoUrl) { <img [src]="shop()!.logoUrl" alt="" class="j-logo" /> }
          <h1>Join {{ shop()?.name }}</h1>
        </div>
        <p class="j-muted">Collect {{ shop()?.loyaltyStampsRequired }} stamps and get: <strong>{{ shop()?.loyaltyReward }}</strong>.</p>
        <div class="j-field"><label>Your name</label><input [(ngModel)]="name" placeholder="e.g. Thabo M." autocomplete="name" /></div>
        <div class="j-field"><label>Phone number</label><input [(ngModel)]="phone" type="tel" inputmode="tel" placeholder="e.g. 082 123 4567" autocomplete="tel" /></div>
        <div class="j-field"><label>Email (optional)</label><input [(ngModel)]="email" type="email" inputmode="email" placeholder="you@example.com" autocomplete="email" /></div>
        <label class="j-consent"><input type="checkbox" [(ngModel)]="consent" /> <span>I agree to {{ shop()?.name }} storing my details for their loyalty programme and contacting me about it. I can ask them to remove my details anytime.</span></label>
        @if (err()) { <p class="j-err">{{ err() }}</p> }
        <button class="j-btn" [disabled]="busy()" (click)="submit()">{{ busy() ? 'Joining…' : 'Join now' }}</button>
        <button class="j-link" (click)="setMode('member')">Already a member? Check my points</button>
      }
    </div>
    <p class="j-foot">Powered by CoffeeShop Pro</p>
  </div>
  `,
  styles: [`
    :host { display:block; min-height:100dvh; background:var(--surface, #141414); color:var(--text, #eee); }
    .join-wrap { min-height:100dvh; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:1.5rem; gap:1rem; }
    .join-card { width:min(440px,100%); background:var(--surface-2, #1e1e1e); border:1px solid var(--border, #333); border-radius:1.25rem; padding:1.75rem; box-shadow:0 8px 32px rgba(0,0,0,.3); }
    .j-brand { text-align:center; margin-bottom:1rem; }
    .j-logo { width:72px; height:72px; object-fit:contain; border-radius:14px; background:#fff; padding:6px; margin-bottom:.6rem; }
    h1 { font-size:1.5rem; margin:0 0 .25rem; letter-spacing:-.02em; }
    .j-muted { color:var(--muted, #999); font-size:.95rem; line-height:1.5; margin:.4rem 0; }
    .j-field { display:flex; flex-direction:column; gap:.35rem; margin:.85rem 0; }
    .j-field label { font-size:.72rem; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:var(--muted, #999); }
    .j-field input { padding:.8rem .9rem; border:1px solid var(--border-hover, #444); border-radius:.7rem; background:var(--surface, #141414); color:var(--text, #eee); font-family:inherit; font-size:1rem; outline:none; }
    .j-field input:focus { border-color:var(--accent, #c88738); }
    .j-consent { display:flex; gap:.6rem; align-items:flex-start; margin:1rem 0; font-size:.82rem; color:var(--muted,#aaa); line-height:1.45; cursor:pointer; }
    .j-consent input { width:20px; height:20px; margin-top:1px; flex:0 0 auto; accent-color:var(--accent, #c88738); }
    .j-btn { width:100%; padding:.95rem; border:0; border-radius:.7rem; background:var(--accent, #c88738); color:#fff; font-family:inherit; font-size:1.05rem; font-weight:800; cursor:pointer; margin-top:.5rem; }
    .j-btn:disabled { opacity:.6; }
    .j-err { color:var(--red, #e5484d); font-size:.85rem; font-weight:600; margin:.5rem 0; }
    .j-qr { display:flex; justify-content:center; margin:1.25rem 0; }
    .j-qr img { width:220px; height:220px; background:#fff; padding:12px; border-radius:14px; }
    .j-code { text-align:center; font-size:1.05rem; letter-spacing:.08em; }
    .j-stamps { text-align:center; font-size:1.35rem; font-weight:800; color:var(--accent, #c88738); margin:.75rem 0; }
    .j-link { display:block; width:100%; margin-top:.9rem; background:none; border:0; color:var(--muted, #999); font-family:inherit; font-size:.9rem; text-decoration:underline; cursor:pointer; }
    .j-foot { color:var(--muted, #777); font-size:.72rem; }
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

  name = ''; phone = ''; email = ''; consent = false; lookup = '';

  ngOnInit() {
    this.code = this.route.snapshot.paramMap.get('code') ?? '';
    if (!this.code) { this.loading.set(false); this.notFound.set(true); return; }
    this.service.getPublicShop(this.code).subscribe({
      next: s => { this.shop.set(s); this.loading.set(false); },
      error: () => { this.loading.set(false); this.notFound.set(true); },
    });
  }

  setMode(m: 'signup' | 'member') { this.err.set(''); this.mode.set(m); }

  // Back to the start (from a shown card): clear the result and inputs.
  reset() {
    this.done.set(null); this.qr.set(''); this.err.set(''); this.welcomeBack.set(false);
    this.lookup = ''; this.mode.set('signup');
  }

  private async showCard(res: any) {
    this.done.set(res);
    try {
      const QRCode = (await import('qrcode')).default ?? (await import('qrcode'));
      this.qr.set(await (QRCode as any).toDataURL(`LOY:${res.loyaltyCode}`, { width: 440, margin: 1 }));
    } catch { /* QR lib unavailable - the code text is still shown */ }
  }

  submit() {
    this.err.set('');
    if (!this.name.trim()) { this.err.set('Please enter your name.'); return; }
    if (!this.phone.trim() && !this.email.trim()) { this.err.set('Please give a phone number or email.'); return; }
    if (!this.consent) { this.err.set('Please tick the box to join.'); return; }
    this.busy.set(true);
    this.service.publicSignup(this.code, { name: this.name.trim(), phone: this.phone.trim() || null, email: this.email.trim() || null, consent: this.consent }).subscribe({
      next: (res) => { this.busy.set(false); this.welcomeBack.set(false); void this.showCard(res); },
      error: (e) => { this.busy.set(false); this.err.set(e.error?.error || 'Could not sign you up. Please try again.'); },
    });
  }

  checkPoints() {
    this.err.set('');
    if (!this.lookup.trim()) { this.err.set('Enter your phone number or code.'); return; }
    this.busy.set(true);
    this.service.publicMemberLookup(this.code, this.lookup.trim()).subscribe({
      next: (res) => { this.busy.set(false); this.welcomeBack.set(true); void this.showCard(res); },
      error: (e) => { this.busy.set(false); this.err.set(e.error?.error || 'No card found. Please sign up.'); },
    });
  }
}
