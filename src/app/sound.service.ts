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

  // Sale complete: two ascending chimes.
  orderComplete() {
    this.tone(880, 0, 0.12, 'sine', 0.3);
    this.tone(1318.5, 0.12, 0.24, 'sine', 0.3);
  }

  // New notification in the admin bell: soft two-tone ping.
  notification() {
    this.tone(1046.5, 0, 0.14, 'triangle', 0.22);
    this.tone(1568, 0.14, 0.3, 'triangle', 0.22);
  }
}
