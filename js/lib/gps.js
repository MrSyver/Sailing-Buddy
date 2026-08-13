/**
 * GPS über die Geolocation-Schnittstelle des Browsers.
 *
 * Läuft vollständig offline: Der Empfänger im Gerät braucht kein Netz.
 * Ohne Mobilfunk dauert der erste Fix allerdings länger, weil die Hilfsdaten
 * fehlen – deshalb der großzügige Timeout und die Anzeige des Suchzustands.
 */

const listeners = new Set();

let watchId = null;
let last = null;   // { lat, lon, accuracy, speed, heading, ts }
let status = 'idle'; // 'idle' | 'searching' | 'ok' | 'denied' | 'unavailable' | 'timeout'
let lastError = null;

function emit() {
  const snapshot = { fix: last, status, error: lastError };
  listeners.forEach((fn) => fn(snapshot));
}

function onSuccess(pos) {
  const c = pos.coords;
  last = {
    lat: c.latitude,
    lon: c.longitude,
    accuracy: c.accuracy,
    // Geschwindigkeit kommt in m/s, an Bord rechnen wir in Knoten.
    speed: c.speed === null || Number.isNaN(c.speed) ? null : c.speed * 1.943844,
    heading: c.heading === null || Number.isNaN(c.heading) ? null : c.heading,
    altitude: c.altitude,
    ts: pos.timestamp,
  };
  status = 'ok';
  lastError = null;
  emit();
}

function onError(err) {
  if (err.code === 1) status = 'denied';
  else if (err.code === 2) status = 'unavailable';
  else if (err.code === 3) status = last ? 'ok' : 'timeout';
  lastError = err.message;
  emit();
}

export const gps = {
  start() {
    if (!('geolocation' in navigator)) {
      status = 'unavailable';
      lastError = 'geolocation unsupported';
      emit();
      return;
    }
    if (watchId !== null) return;
    status = last ? 'ok' : 'searching';
    emit();
    watchId = navigator.geolocation.watchPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      maximumAge: 2000,
      timeout: 30000,
    });
  },

  stop() {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
  },

  get fix() {
    return last;
  },

  get status() {
    return status;
  },

  get error() {
    return lastError;
  },

  /** Ist der letzte Fix noch frisch genug, um damit zu navigieren? */
  isStale(maxAgeMs = 30000) {
    return !last || Date.now() - last.ts > maxAgeMs;
  },

  onUpdate(fn) {
    listeners.add(fn);
    fn({ fix: last, status, error: lastError });
    return () => listeners.delete(fn);
  },
};

/** Übersetzungsschlüssel zum jeweiligen Zustand – Text kommt aus i18n. */
export const GPS_STATUS_KEY = {
  idle: 'gps.idle',
  searching: 'gps.searching',
  ok: 'gps.ok',
  denied: 'gps.denied',
  unavailable: 'gps.unavailable',
  timeout: 'gps.timeout',
};
