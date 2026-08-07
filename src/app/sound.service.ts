import { Injectable } from '@angular/core';

// Tiny Web Audio chimes — no audio files, no assets. Used for the
// sale-complete jingle on the POS and the notification bell in admin.
@Injectable({ providedIn: 'root' })
export class SoundService {
  private ctx: AudioContext | null = null;

  private ensure(): AudioContext | null {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext || (window as any).webkitAudioContext;
        if (!Ctor) return null;
        this.ctx = new Ctor();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  private tone(freq: number, at: number, dur: number, type: OscillatorType = 'sine', vol = 0.25) {
    const ctx = this.ensure();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      const t0 = ctx.currentTime + at;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(vol, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    } catch { /* audio is best-effort */ }
  }

  // Rich bell tone: fundamental + 2nd/3rd harmonics with a fast attack and
  // long exponential decay — reads as a real "ching" instead of a beep.
  private bell(freq: number, at: number, dur: number, vol: number) {
    const ctx = this.ensure();
    if (!ctx) return;
    try {
      const t0 = ctx.currentTime + at;
      for (const [mult, g] of [[1, 1], [2, 0.4], [3, 0.16]] as const) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq * mult;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(vol * g, t0 + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + dur + 0.05);
      }
    } catch { /* audio is best-effort */ }
  }

  // Sale complete: a soft cash-register "cha-ching" — muted thunk, then a
  // bright E6 bell with a higher A6 sparkle.
  orderComplete() {
    this.tone(196, 0, 0.05, 'sine', 0.18);   // low "ka"
    this.bell(1318.5, 0.05, 0.65, 0.24);     // "ching" (E6)
    this.bell(1318.5 * 1.006, 0.05, 0.5, 0.08); // detuned shimmer layer
    this.bell(1760, 0.12, 0.4, 0.15);        // bright top (A6)
  }

  // New notification in the admin bell: soft two-tone ping.
  notification() {
    this.tone(1046.5, 0, 0.14, 'triangle', 0.22);
    this.tone(1568, 0.14, 0.3, 'triangle', 0.22);
  }

  // Send confirmation (broadcast): quick snappy double blip.
  sent() {
    this.tone(659.25, 0, 0.09, 'sine', 0.26);
    this.tone(880, 0.09, 0.14, 'sine', 0.26);
  }
}
