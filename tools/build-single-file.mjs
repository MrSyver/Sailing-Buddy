/**
 * Baut eine einzige, in sich geschlossene HTML-Datei: dist/sailing-buddy.html
 *
 *     node tools/build-single-file.mjs
 *
 * Wozu? Die auf dem Home-Bildschirm installierte App ist der normale Weg und
 * läuft dauerhaft ohne Verbindung. Räumt das Betriebssystem den Speicher aber
 * doch einmal auf – und das merkt man erfahrungsgemäß zum ungünstigsten
 * Zeitpunkt –, dann hilft eine Kopie, die man selbst in der Hand hat: eine
 * Datei in „Dateien“ oder iCloud Drive, per AirDrop übertragbar, ohne Server
 * und ohne Netz zu öffnen.
 *
 * Wichtig: Dies ist die Rückfallebene, nicht der Hauptweg. Aus einer lokalen
 * Datei heraus geben Browser den Standort je nach Fassung nicht frei; dann
 * bleiben Funksprüche, Lichter und Schallsignale nutzbar und die Position
 * wird von Hand eingetragen.
 *
 * Der Bauschritt betrifft ausschließlich diese Zusatzdatei. Die App selbst
 * läuft weiterhin unverändert so, wie sie im Verzeichnis liegt.
 */

import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = join(ROOT, 'dist');
const OUT = join(OUT_DIR, 'sailing-buddy.html');

const ICONS = ['icons/icon-180.png'];

async function dataUri(rel, mime) {
  const buf = await readFile(join(ROOT, rel));
  return `data:${mime};base64,${buf.toString('base64')}`;
}

const css = await readFile(join(ROOT, 'css/style.css'), 'utf8');

// Alle Module zu einem Bündel zusammenfassen. Kein Modulsystem mehr nötig,
// damit die Datei auch über file:// läuft – dort scheitern ES-Module an den
// Herkunftsregeln des Browsers.
const bundled = await build({
  entryPoints: [join(ROOT, 'js/app.js')],
  bundle: true,
  format: 'iife',
  target: ['safari15'],
  charset: 'utf8',
  write: false,
  legalComments: 'none',
});

const js = bundled.outputFiles[0].text;
const appleIcon = await dataUri(ICONS[0], 'image/png');

const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Offline-Helfer für Segler – vollständig in einer Datei.">
<meta name="theme-color" content="#000000">
<meta name="color-scheme" content="dark light">
<title>Sailing Buddy</title>
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Sailing Buddy">
<link rel="apple-touch-icon" href="${appleIcon}">
<style>
${css}
</style>
</head>
<body>

<div id="dimmer" aria-hidden="true"></div>

<div class="app" id="app">
  <main>
    <div class="card"><h2>Sailing Buddy wird geladen …</h2></div>
  </main>
</div>

<noscript>
  <div style="padding:20px;font-family:sans-serif">
    <h2>JavaScript ist ausgeschaltet</h2>
    <p>Sailing Buddy rechnet Kurse und Entfernungen direkt im Gerät und braucht dafür JavaScript.</p>
  </div>
</noscript>

<script>
${js}
</script>
</body>
</html>
`;

await mkdir(OUT_DIR, { recursive: true });
await writeFile(OUT, html, 'utf8');

const kb = Math.round(Buffer.byteLength(html) / 1024);
console.log(`dist/sailing-buddy.html geschrieben – ${kb} kB, eine Datei, keine weiteren Bestandteile.`);
