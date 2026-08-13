/**
 * Rauchtest: startet die App in einem echten Browser, klappert alle Module ab
 * und meldet jeden Fehler in der Konsole als Fehlschlag.
 *
 *   node tools/smoke.mjs            (nur prüfen)
 *   node tools/smoke.mjs --shots    (zusätzlich Bildschirmfotos ablegen)
 *
 * Playwright ist nur eine Entwicklungsabhängigkeit; für den Betrieb der App
 * wird sie nicht gebraucht.
 */

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = process.env.SHOT_DIR ?? join(ROOT, 'screenshots');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function serve() {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const rel = normalize(path === '/' ? '/index.html' : path).replace(/^(\.\.[/\\])+/, '');
    try {
      const body = await readFile(join(ROOT, rel));
      res.writeHead(200, { 'Content-Type': MIME[extname(rel)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const problems = [];
const steps = [];

function check(name, condition, detail = '') {
  steps.push({ name, ok: Boolean(condition), detail });
  if (!condition) problems.push(`${name}${detail ? ` – ${detail}` : ''}`);
}

/** Bricht der Test ab, ist der Bildschirminhalt die wichtigste Spur. */
async function dumpOnFailure(page, err) {
  console.error(`\nAbbruch: ${err.message.split("\n").slice(0, 9).join("\n")}`);
  console.error(String(err.stack ?? "").split("\n").find((l) => l.includes("smoke.mjs")) ?? "");
  if (problems.length) console.error('Bisherige Auffälligkeiten:\n  ' + problems.join('\n  ') + '\n');
  try {
    console.error('Sichtbarer Text:\n', (await page.locator('main').innerText()).slice(0, 800));
    const names = [];
    for (const b of await page.locator('button').all()) {
      names.push(JSON.stringify((await b.innerText()).replace(/\s+/g, ' ').slice(0, 45)));
    }
    console.error('\nSchaltflächen:', names.join(', '));
  } catch {
    console.error('(Seiteninhalt nicht lesbar)');
  }
}

const { server, port } = await serve();
const base = `http://127.0.0.1:${port}/`;

// Ist im System bereits ein Chromium hinterlegt, wird dieses genommen –
// sonst das von Playwright selbst installierte.
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },       // iPhone-Format
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  locale: 'de-DE',
  permissions: ['geolocation'],
  geolocation: { latitude: 54.5, longitude: 10.27, accuracy: 8 },
});

const page = await context.newPage();

page.on('console', (msg) => {
  if (msg.type() === 'error') problems.push(`Konsolenfehler: ${msg.text()}`);
});
page.on('pageerror', (err) => problems.push(`Ausnahme: ${err.message}`));

// Läuft ein Schritt in eine Zeitüberschreitung, wird der Bildschirminhalt
// ausgegeben – sonst steht da nur „Timeout“ und man rät.
const abort = async (err) => {
  await dumpOnFailure(page, err instanceof Error ? err : new Error(String(err)));
  await browser.close().catch(() => {});
  server.close();
  process.exit(1);
};
process.on('unhandledRejection', abort);
process.on('uncaughtException', abort);

await page.goto(base, { waitUntil: 'networkidle' });

if (SHOTS) await mkdir(SHOT_DIR, { recursive: true });
const shot = async (name) => {
  if (SHOTS) await page.screenshot({ path: join(SHOT_DIR, `${name}.png`) });
};

// --- Einrichtung -----------------------------------------------------------
check('Einrichtung erscheint', await page.getByText('Willkommen an Bord').isVisible());

const go = page.getByRole('button', { name: /Schiffsname und MMSI eintragen|Los geht/ });
check('Weiter ist ohne Angaben gesperrt', await go.isDisabled());

await page.locator('input.mono').first().fill('SEEBÄR');
await page.locator('input[inputmode="numeric"]').first().fill('12345');
check('Unvollständige MMSI wird bemängelt',
  await page.getByText('neun Ziffern', { exact: false }).count() > 0);

await page.locator('input[inputmode="numeric"]').first().fill('211234560');
await page.locator('input.mono').nth(2).fill('DA1234');
await page.locator('input[inputmode="numeric"]').nth(1).fill('4');
await shot('01-setup');
check('Weiter ist jetzt frei', await go.isEnabled());
await go.click();

// --- Funkmodul -------------------------------------------------------------
await page.waitForSelector('nav.tabs');
check('Kopfzeile zeigt das Schiff', (await page.locator('.boat-tag').innerText()).includes('SEEBÄR'));

const gpsBar = page.locator('#gpsbar');
await page.waitForFunction(() => document.querySelector('#gpsbar')?.textContent?.includes('°'), null,
  { timeout: 10000 }).catch(() => {});
check('GPS-Leiste zeigt eine Position', (await gpsBar.innerText()).includes('54°'));

await page.getByRole('button', { name: 'MAYDAY – Notruf' }).click();
const script = await page.locator('.script').innerText();
check('Notruf enthält den Schiffsnamen', script.includes('SEEBÄR'), script.slice(0, 60));
check('Notruf enthält die MMSI', script.includes('211234560'));
check('Notruf enthält die GPS-Position', /54°3\d,\d{3}' N/.test(script), script.slice(0, 200));
check('Personen an Bord eingesetzt', script.includes('AN BORD SIND 4 PERSONEN'));
await shot('02-mayday-de');

// Sprache der Funksprüche umschalten – die Oberfläche bleibt deutsch.
await page.getByRole('button', { name: 'English' }).first().click();
const scriptEn = await page.locator('.script').innerText();
check('Funkspruch wechselt auf Englisch', scriptEn.includes('THIS IS SEEBÄR'), scriptEn.slice(0, 60));
check('Oberfläche bleibt dabei deutsch',
  await page.getByRole('button', { name: '‹ Zurück' }).isVisible());
await shot('03-mayday-en');

await page.getByRole('button', { name: '‹ Zurück' }).click();
await page.getByRole('button', { name: 'Deutsch' }).first().click();

// --- Positionsmodul --------------------------------------------------------
await page.locator('nav.tabs button').nth(1).click();
await page.waitForSelector('.posline');
check('Eigene Position wird angezeigt', (await page.locator('.posline').innerText()).includes('54°'));

await page.locator('textarea').fill(`54°26.000' N 011°11.400' E`);
await page.getByRole('button', { name: 'Übernehmen' }).click();
await page.waitForSelector('.compass');

// Der erste Messwertblock gehört zur eigenen Position, der zweite zum Ergebnis.
const distance = await page.locator('.cell.hero').first().innerText();
check('Entfernung berechnet', /32,4\s*sm/.test(distance.replace(/\n/g, ' ')),
  distance.replace(/\n/g, ' | '));
check('Entfernung mit deutschem Dezimalkomma', distance.includes(','), distance.replace(/\n/g, ' | '));
// SVG-Knoten kennen kein innerText.
const bearing = await page.locator('.compass .center-text').textContent();
check('Kurs im Kompass', bearing === '097°', bearing);
await shot('04-position');

// Unsinnige Eingabe muss abgefangen werden.
await page.locator('textarea').fill('völliger Unfug');
await page.getByRole('button', { name: 'Übernehmen' }).click();
check('Fehlerhafte Eingabe wird gemeldet',
  await page.getByText('nicht erkannt', { exact: false }).count() > 0);

await page.locator('textarea').fill(`54°26.000' N 011°11.400' E`);
await page.getByRole('button', { name: 'Übernehmen' }).click();

// MOB-Knopf legt einen Wegpunkt an.
await page.getByRole('button', { name: /Mensch über Bord/ }).click();
await page.waitForSelector('.wp-item');
check('MOB-Wegpunkt angelegt', (await page.locator('.wp-item').first().innerText()).includes('MOB'));

// --- Nachtfahrt ------------------------------------------------------------
await page.locator('nav.tabs button').nth(2).click();
await page.waitForSelector('.light-card');
const cardsAll = await page.locator('.light-card').count();
check('Lichterliste gefüllt', cardsAll > 10, `${cardsAll} Einträge`);

await page.getByRole('button', { name: /Rot$/ }).first().click();
await page.getByRole('button', { name: /Grün$/ }).first().click();
const cardsFiltered = await page.locator('.light-card').count();
check('Farbfilter grenzt ein', cardsFiltered > 0 && cardsFiltered < cardsAll,
  `${cardsFiltered} von ${cardsAll}`);
await shot('05-lights');

await page.getByRole('button', { name: '✕ zurücksetzen' }).click();
await page.getByRole('button', { name: 'Schall' }).click();
await page.waitForSelector('.sound-symbol');
check('Schallsignale gelistet', await page.locator('.sound-item').count() > 5);

await page.getByRole('button', { name: 'Grundlagen' }).click();
check('Grundlagen zeigen die Tragweiten',
  await page.getByText('Tragweiten', { exact: false }).count() > 0);

// --- Nachtmodus ------------------------------------------------------------
await page.locator('.topbar .icon-btn').click();
check('Nachtmodus aktiv', await page.locator('html').getAttribute('data-theme') === 'night');

const nightColors = await page.evaluate(() => {
  const cs = getComputedStyle(document.documentElement);
  // Die Variablen stehen als Hexwert in der Datei – in Rot, Grün, Blau zerlegen.
  const parse = (v) => {
    const hex = v.trim().replace('#', '');
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  };
  return {
    bg: parse(cs.getPropertyValue('--bg')),
    text: parse(cs.getPropertyValue('--text')),
    accent: parse(cs.getPropertyValue('--accent')),
    surface: parse(cs.getPropertyValue('--surface')),
  };
});
// Im Nachtmodus darf nichts kurzwellig leuchten: kein Blau, kaum Grün.
// Nur langwelliges Rot lässt die Dunkeladaption weitgehend unangetastet.
const longWaveOnly = ([r, g, b], name) => {
  check(`Nachtmodus: ${name} ohne Blauanteil`, b <= 20, `RGB ${r},${g},${b}`);
  check(`Nachtmodus: ${name} dominiert im Rot`, r >= g * 2, `RGB ${r},${g},${b}`);
};
check('Nachtmodus: Hintergrund ist schwarz',
  nightColors.bg.every((c) => c === 0), JSON.stringify(nightColors.bg));
check('Nachtmodus: Flächen bleiben fast schwarz',
  nightColors.surface.every((c) => c <= 20), JSON.stringify(nightColors.surface));
longWaveOnly(nightColors.text, 'Text');
longWaveOnly(nightColors.accent, 'Akzent');
// Zurück auf die Lichterliste: Dort zeigt sich, ob die Schemabilder im
// Nachtmodus gedämpft werden, statt mit Weiß und Grün zu blenden.
await page.evaluate(() => window.scrollTo(0, 0));
await page.getByRole('button', { name: 'Lichter' }).click();
await page.waitForSelector('.light-view');
const dimmed = await page.locator('.light-view').first().evaluate((el) => getComputedStyle(el).filter);
check('Nachtmodus dämpft die Lichterschemata', /brightness\(0?\.\d+\)/.test(dimmed), dimmed);

// Keine gefüllten Leuchtflächen: Alles, was gerade aktiv ist, darf im
// Nachtmodus nur eine Kontur zeigen, sonst blendet es auf der Wache.
const filled = await page.evaluate(() => {
  const bright = [];
  for (const el of document.querySelectorAll('[aria-pressed="true"], .btn.primary, .btn.danger')) {
    const bg = getComputedStyle(el).backgroundColor;
    const [r, g, b, a = '1'] = (bg.match(/[\d.]+/g) ?? ['0', '0', '0', '0']);
    if (Number(a) > 0 && Number(r) + Number(g) + Number(b) > 120) {
      bright.push(`${el.className || el.tagName}: ${bg}`);
    }
  }
  return bright;
});
check('Nachtmodus ohne leuchtende Flächen', filled.length === 0, filled.join(' | '));
await shot('06-night-mode');

// --- Oberflächensprache ----------------------------------------------------
await page.locator('nav.tabs button').nth(3).click();
await page.waitForSelector('.card');
await page.getByRole('button', { name: 'English' }).first().click();
await page.waitForTimeout(150);
const tabsText = await page.locator('nav.tabs').innerText();
check('Reiter auf Englisch', tabsText.includes('Radio') && tabsText.includes('Settings'), tabsText);
check('Titel auf Englisch', (await page.locator('.topbar h1').innerText()).includes('Settings'));
await shot('07-settings-en');

// Funkspruchsprache blieb davon unberührt (steht noch auf Deutsch).
await page.locator('nav.tabs button').nth(0).click();
await page.waitForSelector('.phrase-btn');
const firstPhrase = await page.locator('.phrase-btn').first().innerText();
check('Funksprüche unabhängig von der Oberflächensprache',
  firstPhrase.includes('MAYDAY – Notruf'), firstPhrase.replace(/\n/g, ' | '));

await page.getByRole('button', { name: 'Deutsch' }).first().click();

// --- Helligkeit ------------------------------------------------------------
await page.locator('nav.tabs button').nth(3).click();
await page.locator('input[type="range"]').fill('40');
// Der Dimmer blendet über 0,2 s ein – erst danach steht der Endwert.
await page.waitForTimeout(400);
const dim = await page.locator('#dimmer').evaluate((el) => getComputedStyle(el).opacity);
check('Dimmer greift', Number(dim) > 0.5, `Deckkraft ${dim}`);
check('Dimmer blockiert keine Eingaben',
  await page.locator('#dimmer').evaluate((el) => getComputedStyle(el).pointerEvents) === 'none');
await page.locator('input[type="range"]').fill('100');

// --- Offline ---------------------------------------------------------------
await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, null, { timeout: 8000 })
  .catch(() => problems.push('Service Worker hat die Seite nicht übernommen'));

await context.setOffline(true);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('nav.tabs', { timeout: 8000 })
  .catch(() => problems.push('App startet offline nicht'));
check('App läuft offline weiter', await page.locator('nav.tabs').count() === 1);
check('Schiffsdaten offline erhalten',
  (await page.locator('.boat-tag').innerText()).includes('SEEBÄR'));
await shot('08-offline');
await context.setOffline(false);

// --- Ergebnis --------------------------------------------------------------
await browser.close();
server.close();

for (const s of steps) {
  console.log(`${s.ok ? '  ok  ' : ' FAIL '} ${s.name}${s.ok || !s.detail ? '' : ` → ${s.detail}`}`);
}

const consoleProblems = problems.filter((p) => !steps.some((s) => !s.ok && p.startsWith(s.name)));
for (const p of consoleProblems) console.log(` FAIL  ${p}`);

const failed = steps.filter((s) => !s.ok).length + consoleProblems.length;
console.log(`\n${steps.length} Prüfungen, ${failed} Fehler`);
process.exit(failed ? 1 : 0);
