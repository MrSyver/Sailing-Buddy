/**
 * Offline-Bereitschaft: nachweisen statt hoffen.
 *
 * Die App soll nicht nur „meistens“ ohne Netz laufen, sondern nachweislich
 * immer. Dafür zwei Dinge:
 *
 * 1. Vollständigkeit – der Service Worker vergleicht seine Dateiliste mit dem
 *    Cache und meldet jede Lücke. Fehlt etwas und ist eine Verbindung da,
 *    wird sofort nachgeladen.
 * 2. Dauerhaftigkeit – über navigator.storage.persist() wird der Speicher als
 *    dauerhaft angefordert. Ohne diese Kennzeichnung darf das Betriebssystem
 *    abgelegte Daten wegräumen, wenn es eng wird. Genau das würde die App
 *    ausgerechnet dann treffen, wenn sie gebraucht wird.
 */

const listeners = new Set();

const state = {
  supported: 'serviceWorker' in navigator,
  controlled: false,     // Service Worker steuert diese Seite
  ready: false,          // alle Dateien liegen im Gerät
  missing: [],
  total: 0,
  version: null,
  persisted: null,       // true | false | null (nicht unterstützt)
  usageBytes: null,
  checking: false,
  lastCheck: null,
  error: null,
};

function emit() {
  listeners.forEach((fn) => fn({ ...state }));
}

export function onOfflineChange(fn) {
  listeners.add(fn);
  fn({ ...state });
  return () => listeners.delete(fn);
}

export const offlineState = () => ({ ...state });

/** Schickt dem Service Worker eine Frage und wartet auf die Antwort. */
function ask(worker, message, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => reject(new Error('Zeitüberschreitung')), timeoutMs);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve(event.data);
    };
    worker.postMessage(message, [channel.port2]);
  });
}

async function activeWorker() {
  if (!state.supported) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.active ?? navigator.serviceWorker.controller;
}

/**
 * Fordert dauerhaften Speicher an. Safari entscheidet selbst; auf dem
 * Home-Bildschirm installierte Web-Apps bekommen ihn in aller Regel.
 */
export async function requestPersistence() {
  if (!navigator.storage?.persist) {
    state.persisted = null;
    return null;
  }
  try {
    state.persisted = (await navigator.storage.persisted())
      || (await navigator.storage.persist());
  } catch {
    state.persisted = null;
  }
  emit();
  return state.persisted;
}

async function readUsage() {
  try {
    const estimate = await navigator.storage?.estimate?.();
    state.usageBytes = estimate?.usage ?? null;
  } catch {
    state.usageBytes = null;
  }
}

/**
 * Prüft, ob wirklich alles im Gerät liegt.
 * `repair` lädt fehlende Dateien nach, sofern eine Verbindung besteht.
 */
export async function checkReadiness({ repair = true } = {}) {
  if (!state.supported) {
    state.error = 'Dieser Browser kann keine Offline-Kopie anlegen.';
    emit();
    return { ...state };
  }

  state.checking = true;
  state.error = null;
  emit();

  try {
    const worker = await activeWorker();
    state.controlled = Boolean(worker);
    if (!worker) throw new Error('Offline-Kopie wird noch eingerichtet.');

    let result = await ask(worker, { type: 'CHECK' });

    if (result.missing.length && repair && navigator.onLine) {
      result = await ask(worker, { type: 'PRECACHE' }, 60000);
    }

    state.version = result.version ?? state.version;
    state.total = result.total ?? state.total;
    state.missing = result.missing ?? [];
    state.ready = state.missing.length === 0;
    state.lastCheck = Date.now();
    if (result.ok === false) state.error = result.error ?? null;
  } catch (err) {
    state.error = err.message;
    state.ready = false;
  }

  await readUsage();
  state.checking = false;
  emit();
  return { ...state };
}

/** Lädt die Offline-Kopie vollständig neu – braucht eine Verbindung. */
export async function refreshOfflineCopy() {
  if (!navigator.onLine) {
    state.error = 'Dafür wird einmalig eine Verbindung gebraucht.';
    emit();
    return { ...state };
  }
  state.checking = true;
  state.error = null;
  emit();
  try {
    const worker = await activeWorker();
    if (!worker) throw new Error('Offline-Kopie wird noch eingerichtet.');
    const result = await ask(worker, { type: 'PRECACHE' }, 60000);
    state.missing = result.missing ?? [];
    state.ready = state.missing.length === 0;
    state.version = result.version ?? state.version;
    state.total = result.total ?? state.total;
    state.error = result.ok === false ? result.error : null;
    state.lastCheck = Date.now();
  } catch (err) {
    state.error = err.message;
  }
  await readUsage();
  state.checking = false;
  emit();
  return { ...state };
}

/**
 * Wird einmal beim Start aufgerufen: Service Worker anmelden, dauerhaften
 * Speicher anfordern, Vollständigkeit prüfen und Lücken schließen.
 */
export async function initOffline() {
  if (!state.supported) {
    emit();
    return;
  }

  try {
    await navigator.serviceWorker.register('./sw.js', { scope: './' });
  } catch (err) {
    state.error = `Offline-Kopie nicht möglich: ${err.message}`;
    emit();
    return;
  }

  await requestPersistence();
  await checkReadiness({ repair: true });

  // Nach einem Neustart übernimmt der Service Worker die Seite oft erst beim
  // zweiten Aufruf. Dann noch einmal nachfassen, damit die Anzeige stimmt.
  if (!state.controlled) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      checkReadiness({ repair: true });
    });
  }
}

/** Menschenlesbare Größenangabe. */
export function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return '–';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
