/**
 * Schallsignale werden im Gerät erzeugt, nicht abgespielt.
 * Dadurch braucht die App keine Tondateien und bleibt klein und offline-fähig.
 *
 * Nebelhorn: tiefer Grundton mit Obertönen und weichem Ein- und Ausschwingen.
 * Glocke:    heller Anschlag, der schnell ausklingt.
 */

import { SOUND_DURATION } from '../data/sounds.js';

let ctx = null;
let stopFlag = false;
let running = false;
const listeners = new Set();

function context() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function notify(state) {
  running = state;
  listeners.forEach((fn) => fn(state));
}

/** Nebelhorn-Ton: Grundton 110 Hz plus Oberton, leicht rau. */
function horn(at, duration, gainNode) {
  const c = ctx;
  const partials = [
    { f: 110, g: 0.6 },
    { f: 220, g: 0.28 },
    { f: 330, g: 0.12 },
    { f: 165, g: 0.08 },
  ];
  const env = c.createGain();
  const attack = 0.08;
  const release = 0.18;
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(1, at + attack);
  env.gain.setValueAtTime(1, at + Math.max(attack, duration - release));
  env.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  env.connect(gainNode);

  partials.forEach(({ f, g }) => {
    const osc = c.createOscillator();
    const og = c.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f, at);
    og.gain.value = g;
    osc.connect(og);
    og.connect(env);
    osc.start(at);
    osc.stop(at + duration + 0.05);
  });
}

/** Einzelner Glockenschlag. */
function bell(at, gainNode, duration = 0.6) {
  const c = ctx;
  const partials = [
    { f: 880, g: 0.5 },
    { f: 1320, g: 0.25 },
    { f: 2200, g: 0.12 },
  ];
  partials.forEach(({ f, g }) => {
    const osc = c.createOscillator();
    const env = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, at);
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(g, at + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(env);
    env.connect(gainNode);
    osc.start(at);
    osc.stop(at + duration + 0.05);
  });
}

/** Rasches Läuten über mehrere Sekunden. */
function ring(at, gainNode, duration) {
  const strokes = Math.round(duration / 0.28);
  for (let i = 0; i < strokes; i += 1) bell(at + i * 0.28, gainNode, 0.3);
}

export const audio = {
  get isPlaying() {
    return running;
  },

  onStateChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /**
   * Spielt eine Signalfolge in Echtzeit ab.
   * `speed` > 1 kürzt die Töne für die schnelle Vorschau an Land.
   */
  async play(pattern, { speed = 1, volume = 0.35 } = {}) {
    const c = context();
    if (!c || !pattern?.length) return;
    this.stop();
    stopFlag = false;

    const master = c.createGain();
    master.gain.value = volume;
    master.connect(c.destination);

    let t = c.currentTime + 0.08;
    const gapShort = 0.45 / speed;

    pattern.forEach((step) => {
      const dur = (SOUND_DURATION[step.k] ?? 1) / speed;
      if (step.k === 'pause') {
        t += dur;
        return;
      }
      if (step.k === 'bell') bell(t, master, dur);
      else if (step.k === 'ring') ring(t, master, dur);
      else if (step.k === 'gong') bell(t, master, dur * 1.5);
      else horn(t, dur, master);
      t += dur + gapShort;
    });

    const total = (t - c.currentTime) * 1000;
    notify(true);
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, total);
      const unsub = this.onStateChange((state) => {
        if (!state) {
          clearTimeout(timer);
          unsub();
          resolve();
        }
      });
    });
    if (!stopFlag) notify(false);
    try {
      master.disconnect();
    } catch { /* schon getrennt */ }
  },

  stop() {
    stopFlag = true;
    if (ctx) {
      // Laufende Töne hart abschneiden: Kontext schließen und neu aufbauen.
      const old = ctx;
      ctx = null;
      old.close().catch(() => {});
    }
    if (running) notify(false);
  },
};
