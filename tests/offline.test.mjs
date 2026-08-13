/**
 * Wacht über die Offline-Kopie.
 *
 * Der teuerste Fehler dieser App wäre eine Datei, die zur Laufzeit gebraucht,
 * aber nicht in die Offline-Liste des Service Workers eingetragen wurde. Das
 * fällt an Land nie auf – dort ist die Datei ja über das Netz erreichbar –
 * und erst auf See, wenn kein Netz mehr da ist.
 *
 * Deshalb wird hier gegengeprüft: Jede Datei, die die laufende App braucht,
 * muss in der Liste stehen, und jeder Eintrag der Liste muss es geben.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { existsSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;

/** Verzeichnisse, die zur Laufzeit gebraucht werden. */
const RUNTIME_DIRS = ['css', 'js', 'icons'];
/** Einzelne Dateien im Wurzelverzeichnis, die dazugehören. */
const RUNTIME_FILES = ['index.html', 'manifest.webmanifest'];

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...await walk(rel));
    else out.push(rel);
  }
  return out;
}

async function assetList() {
  const source = await readFile(join(ROOT, 'sw.js'), 'utf8');
  const block = source.match(/const ASSETS = \[([\s\S]*?)\];/);
  assert.ok(block, 'ASSETS-Liste in sw.js nicht gefunden');
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

test('jede Laufzeitdatei steht in der Offline-Liste', async () => {
  const assets = new Set((await assetList()).map((a) => a.replace(/^\.\//, '')));
  const files = [
    ...RUNTIME_FILES,
    ...(await Promise.all(RUNTIME_DIRS.map(walk))).flat(),
  ];

  const missing = files.filter((f) => !assets.has(f));
  assert.deepEqual(missing, [],
    `Diese Dateien fehlen in ASSETS in sw.js – die App wäre offline unvollständig:\n  ${missing.join('\n  ')}`);
});

test('jeder Eintrag der Offline-Liste zeigt auf eine vorhandene Datei', async () => {
  const assets = await assetList();
  const broken = assets
    .map((a) => a.replace(/^\.\//, ''))
    .filter((a) => a !== '' && !existsSync(join(ROOT, a)));
  assert.deepEqual(broken, [],
    `Diese Einträge in ASSETS gibt es nicht – die Installation würde scheitern:\n  ${broken.join('\n  ')}`);
});

test('die Startseite ist mit aufgeführt', async () => {
  const assets = await assetList();
  assert.ok(assets.includes('./'), 'Das Verzeichnis „./“ fehlt');
  assert.ok(assets.includes('./index.html'), 'index.html fehlt');
});

test('nichts wird aus dem Netz nachgeladen', async () => {
  // Eine einzige Schriftart oder Programmbibliothek von einem fremden Server
  // würde die App ohne Verbindung unbrauchbar machen.
  const files = [
    ...RUNTIME_FILES,
    ...(await Promise.all(RUNTIME_DIRS.map(walk))).flat(),
  ].filter((f) => /\.(html|css|js|webmanifest)$/.test(f));

  const offenders = [];
  for (const file of files) {
    // eslint-disable-next-line no-await-in-loop
    const text = await readFile(join(ROOT, file), 'utf8');
    for (const match of text.matchAll(/https?:\/\/[^\s'"()]+/g)) {
      const url = match[0];
      // Namensräume und Verweise in Kommentaren sind keine Ladevorgänge.
      if (url.startsWith('http://www.w3.org/')) continue;
      if (/^https:\/\/(claude\.ai|code\.claude\.com|github\.com)/.test(url)) continue;
      offenders.push(`${file}: ${url}`);
    }
  }
  assert.deepEqual(offenders, [],
    `Verweise auf fremde Server gefunden – die App wäre offline nicht vollständig:\n  ${offenders.join('\n  ')}`);
});

test('der Service Worker startet aus dem Cache, nicht aus dem Netz', async () => {
  const source = await readFile(join(ROOT, 'sw.js'), 'utf8');
  const navigate = source.slice(source.indexOf("request.mode === 'navigate'"));
  const cacheFirst = navigate.indexOf('caches.match');
  const network = navigate.indexOf('await fetch(request)');
  assert.ok(cacheFirst > -1, 'Seitenaufruf greift nicht auf den Cache zu');
  assert.ok(cacheFirst < network || network === -1,
    'Seitenaufruf versucht zuerst das Netz – der Start hinge dann an der Verbindung');
});

test('eine unvollständige Installation gilt als gescheitert', async () => {
  const source = await readFile(join(ROOT, 'sw.js'), 'utf8');
  const precache = source.slice(source.indexOf('async function precache'));
  assert.ok(/throw new Error/.test(precache.slice(0, 1200)),
    'precache() meldet Lücken nicht – ein halb gefüllter Cache bliebe unbemerkt');
});
