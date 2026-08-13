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
import { extname, join, normalize, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Standardmäßig wird das Arbeitsverzeichnis geprüft. Mit SMOKE_ROOT lässt
// sich stattdessen ein zusammengestelltes Website-Verzeichnis prüfen – also
// genau das, was später wirklich veröffentlicht wird.
const REPO = fileURLToPath(new URL('..', import.meta.url));
const ROOT = process.env.SMOKE_ROOT ? resolve(process.env.SMOKE_ROOT) : REPO;
const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = process.env.SHOT_DIR ?? join(REPO, 'screenshots');

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
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  // Stumme Ersatzquelle statt echtem Mikrofon, damit die Sprachaufnahme
  // im Test tatsächlich durchläuft.
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },       // iPhone-Format
  deviceScaleFactor: 3,
  // isMobile würde eine Browserleiste mitemulieren; die Berührungsbedienung
  // bleibt über hasTouch erhalten.
  hasTouch: true,
  locale: 'de-DE',
  permissions: ['geolocation', 'microphone'],
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

/** Reiter wechseln. Vorher nach oben – bei langen Seiten hakt sonst der Klick. */
const goTab = async (index) => {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('nav.tabs button').nth(index).click();
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

// Reihenfolge: Der Funkspruch steht direkt oben, die Hinweise erst darunter.
const detailText = await page.locator('main').innerText();
const posOfScript = detailText.indexOf('MAYDAY – MAYDAY – MAYDAY');
const posOfDetails = detailText.indexOf('Hinweise und Ablauf');
check('Funkspruch steht vor den Hinweisen',
  posOfScript > -1 && posOfDetails > posOfScript,
  `Spruch bei ${posOfScript}, Hinweise bei ${posOfDetails}`);

// Ohne Auswahl bleibt die Notfallstelle offen.
check('Ohne Auswahl steht dort der Hinweis',
  script.includes('hier den Notfall schildern'), script.slice(0, 300));

// Notfall wählen – der Funkspruch muss sich sofort ändern.
const cases = await page.locator('.emergency').count();
check('Notfälle werden angeboten', cases >= 8, `${cases} Einträge`);
await page.getByRole('button', { name: /Feuer an Bord/ }).click();
const withFire = await page.locator('.script').innerText();
check('Gewählter Notfall steht im Funkspruch',
  withFire.includes('ICH HABE FEUER AN BORD'), withFire.slice(0, 300));
check('Auch die benötigte Hilfe wird gefüllt',
  withFire.includes('ICH BENÖTIGE SOFORTIGE HILFE BEI DER BRANDBEKÄMPFUNG'));
check('Der Hinweis ist verschwunden', !withFire.includes('hier den Notfall schildern'));
check('DSC-Kategorie wird genannt',
  (await page.locator('main').innerText()).includes('Fire, explosion'));
await shot('02b-notfall');

// Auswahl wieder aufheben.
await page.getByRole('button', { name: '✕ Auswahl aufheben' }).click();
check('Auswahl lässt sich aufheben',
  (await page.locator('.script').innerText()).includes('hier den Notfall schildern'));

// Die eigene Position ist im Funkspruch hervorgehoben.
const posSize = await page.locator('.script .position').evaluate(
  (el) => parseFloat(getComputedStyle(el).fontSize));
const lineSize = await page.locator('.script .line').first().evaluate(
  (el) => parseFloat(getComputedStyle(el).fontSize));
check('Position ist größer gesetzt als der übrige Text', posSize > lineSize,
  `Position ${posSize}px, übrige Zeilen ${lineSize}px`);

// Position im Funkspruch zwischen Zahlen und Sprechweise umschalten.
check('Position steht zunächst als Zahlen',
  /54°3\d,\d{3}' N/.test(await page.locator('.script .position').innerText()));
await page.getByRole('button', { name: 'Ausgeschrieben' }).click();
const spokenLine = await page.locator('.script .position').innerText();
check('Position ausgeschrieben im Funkspruch',
  spokenLine.includes('Grad') && spokenLine.includes('Nord'), spokenLine);
await page.getByRole('button', { name: 'Als Zahlen' }).click();

// Sprache der Funksprüche umschalten – die Oberfläche bleibt deutsch.
await page.getByRole('button', { name: 'English' }).first().click();
const scriptEn = await page.locator('.script').innerText();
check('Funkspruch wechselt auf Englisch', scriptEn.includes('THIS IS SEEBÄR'), scriptEn.slice(0, 60));
check('Oberfläche bleibt dabei deutsch',
  await page.getByRole('button', { name: '‹ Zurück' }).isVisible());
await shot('03-mayday-en');

await page.getByRole('button', { name: '‹ Zurück' }).click();
await page.getByRole('button', { name: 'Deutsch' }).first().click();

// --- Sprachaufnahme --------------------------------------------------------
await page.getByRole('button', { name: /Aufnahme starten/ }).click();
await page.waitForSelector('.rec-live', { timeout: 8000 })
  .catch(() => problems.push('Aufnahme startet nicht'));
check('Aufnahme läuft', await page.locator('.rec-live').count() === 1);
await page.waitForTimeout(1200);
await page.getByRole('button', { name: /Aufnahme beenden/ }).click();
await page.waitForSelector('.rec-item', { timeout: 8000 })
  .catch(() => problems.push('Aufnahme wurde nicht gespeichert'));
check('Aufnahme gespeichert', await page.locator('.rec-item').count() === 1);
check('Aufnahme hat einen Abspieler', await page.locator('.rec-item audio').count() === 1);
await shot('02c-aufnahme');

// Löschen muss gehen – sonst sammelt sich das an.
page.once('dialog', (d) => d.accept());
await page.locator('.rec-item').getByRole('button', { name: 'Aufnahme löschen' }).click();
await page.waitForTimeout(400);
check('Aufnahme wieder löschbar', await page.locator('.rec-item').count() === 0);

// --- Positionsmodul --------------------------------------------------------
await goTab(1);
await page.waitForSelector('.posline');
check('Eigene Position wird angezeigt', (await page.locator('.posline').innerText()).includes('54°'));
const ownSize = await page.locator('.posline').evaluate(
  (el) => parseFloat(getComputedStyle(el).fontSize));
check('Eigene Position ist groß gesetzt', ownSize >= 26, `${ownSize}px`);

// Zieleingabe: reine Zifferneingabe, keine Sonderzeichen nötig.
await page.locator('#coord-latDeg').fill('54');
await page.locator('#coord-latMin').fill('26');
await page.locator('#coord-lonDeg').fill('11');
await page.locator('#coord-lonMin').fill('11.4');
await page.waitForSelector('.compass');
check('Kopfzeilen-Symbol ist sichtbar',
  await page.locator('.topbar .icon-btn svg').evaluate((el) => el.getBoundingClientRect().width) > 10);

// Der erste Messwertblock gehört zur eigenen Position, der zweite zum Ergebnis.
const distance = await page.locator('.cell.hero').first().innerText();
check('Entfernung berechnet', /32,4\s*sm/.test(distance.replace(/\n/g, ' ')),
  distance.replace(/\n/g, ' | '));
check('Entfernung mit deutschem Dezimalkomma', distance.includes(','), distance.replace(/\n/g, ' | '));
// SVG-Knoten kennen kein innerText.
const bearing = await page.locator('.compass .center-text').textContent();
check('Kurs im Kompass', bearing === '097°', bearing);
await shot('04-position');

// Buchstaben werden gar nicht erst angenommen.
await page.locator('#coord-latMin').fill('abc26,5');
check('Nur Ziffern landen im Feld',
  (await page.locator('#coord-latMin').inputValue()) === '26,5',
  await page.locator('#coord-latMin').inputValue());

// Unmögliche Werte werden gemeldet.
await page.locator('#coord-latDeg').fill('95');
check('Unmögliche Breite wird gemeldet',
  await page.getByText('Breite bis 90', { exact: false }).count() > 0);
await page.locator('#coord-latDeg').fill('54');
await page.locator('#coord-latMin').fill('26');

// Himmelsrichtung per Schaltfläche.
await page.getByRole('button', { name: 'S', exact: true }).click();
check('Süd kehrt das Vorzeichen um',
  (await page.locator('.coord-check').innerText()).includes('S'),
  await page.locator('.coord-check').innerText());
await page.getByRole('button', { name: 'N', exact: true }).click();

// Eigene Position ausgeschrieben.
await page.getByRole('button', { name: /ausgeschrieben anzeigen/ }).click();
check('Position ausgeschrieben',
  (await page.locator('.spoken-position').innerText()).includes('Grad'),
  await page.locator('.spoken-position').innerText());

// MOB-Knopf merkt die Position direkt darunter.
await page.getByRole('button', { name: /Mensch über Bord/ }).click();
await page.waitForSelector('.mob-row');
const mobRow = await page.locator('.mob-row').innerText();
check('MOB-Position steht direkt unter der Taste', mobRow.includes('MOB'), mobRow.replace(/\n/g, ' | '));
check('MOB-Position zeigt die Koordinaten', /54°30/.test(mobRow), mobRow.replace(/\n/g, ' | '));

// Anderes Ziel setzen, dann MOB wieder übernehmen.
await page.locator('#coord-latMin').fill('26');
// Die MOB-Position steht unter der Taste und zusätzlich in der Liste der
// gemerkten Positionen – beide bieten das Übernehmen an.
const asTarget = await page.getByRole('button', { name: '→ Als Ziel' }).count();
check('MOB lässt sich wieder als Ziel setzen', asTarget >= 1, `${asTarget} Knöpfe`);
await page.locator('.mob-row').getByRole('button', { name: '→ Als Ziel' }).click();
check('MOB ist jetzt das Ziel',
  await page.getByRole('button', { name: '✓ Ist Ziel' }).count() >= 1);

// Auch gemerkte Positionen aus der Liste lassen sich mit einem Klick setzen.
check('Gemerkte Position hat einen Übernehmen-Knopf',
  await page.locator('.wp-item').getByRole('button', { name: /Ist Ziel|Als Ziel/ }).count() >= 1);

// --- Nachtfahrt ------------------------------------------------------------
await goTab(2);
await page.waitForSelector('.light-card');
const cardsAll = await page.locator('.light-card').count();
check('Lichterliste gefüllt', cardsAll > 10, `${cardsAll} Einträge`);

// Lichtersuche: Auswahl grenzt ein, Unmögliches verschwindet.
await page.getByRole('button', { name: /Lichter suchen/ }).click();
await page.waitForSelector('.sheet');
const facetsBefore = await page.locator('.facet').count();
await page.locator('.facet[data-facet="r"]').click();
await page.locator('.facet[data-facet="stack2"]').click();
const facetsAfter = await page.locator('.facet').count();
check('Unmögliche Merkmale fallen weg', facetsAfter < facetsBefore,
  `vorher ${facetsBefore}, nachher ${facetsAfter}`);

// Seezeichen müssen in derselben Suche auftauchen – nachts weiß man ja
// gerade nicht, ob da ein Schiff fährt oder eine Tonne liegt.
await page.locator('.sheet').getByRole('button', { name: /zurücksetzen/ }).click();
await page.locator('.facet[data-facet="w"]').click();
await page.locator('.facet[data-facet="quick"]').click();
await page.locator('.facet[data-facet="longflash"]').click();
const cardinalHit = Number(await page.locator('.sheet-result .n').innerText());
check('Suche findet auch Seezeichen', cardinalHit === 1, `${cardinalHit} Treffer`);
await page.locator('.sheet').getByRole('button', { name: 'Anzeigen' }).click();
await page.waitForSelector('.buoy-light');
check('Gefundenes Seezeichen ist das Südzeichen',
  (await page.locator('main').innerText()).includes('Südzeichen'));
await shot('05d-suche-tonne');

await page.getByRole('button', { name: /Lichter suchen/ }).click();
await page.waitForSelector('.sheet');
await page.locator('.sheet').getByRole('button', { name: /zurücksetzen/ }).click();
await page.locator('.facet[data-facet="r"]').click();
await page.locator('.facet[data-facet="stack2"]').click();

const resultCount = Number(await page.locator('.sheet-result .n').innerText());
check('Suchmaske zeigt die Trefferzahl', resultCount > 0 && resultCount < cardsAll,
  `${resultCount} von ${cardsAll}`);
await shot('05-lichtersuche');

await page.locator('.sheet').getByRole('button', { name: 'Anzeigen' }).click();
await page.waitForSelector('.light-card');
const cardsFiltered = await page.locator('.light-card').count();
check('Suche grenzt die Liste ein', cardsFiltered === resultCount,
  `${cardsFiltered} angezeigt, ${resultCount} erwartet`);
await shot('05b-lights');

await page.locator('.chip', { hasText: 'zurücksetzen' }).click();
check('Filter lässt sich im Reiter zurücksetzen',
  await page.locator('.light-card').count() === cardsAll,
  `${await page.locator('.light-card').count()} von ${cardsAll}`);
await page.getByRole('button', { name: 'Schall' }).click();
await page.waitForSelector('.sound-symbol');
check('Schallsignale gelistet', await page.locator('.sound-item').count() > 5);

// Seezeichen
await page.getByRole('button', { name: 'Tonnen' }).click();
await page.waitForSelector('.buoy-light');
const buoyText = await page.locator('main').innerText();
check('Kardinalzeichen vorhanden', buoyText.includes('Nordzeichen') && buoyText.includes('Westzeichen'));
check('Lateralzeichen vorhanden', buoyText.includes('Backbordzeichen'));
check('Gefahrenzeichen vorhanden', buoyText.includes('Einzelgefahrenstelle'));
check('Feuerkennung wird genannt', buoyText.includes('Q(6) + LFl 15s'), '');
check('Kennungs-Abkürzungen erklärt', buoyText.includes('Funkelfeuer'));
const buoyCards = await page.locator('.buoy-light').count();
check('Alle Seezeichen gelistet', buoyCards === 12, `${buoyCards} Einträge`);
await shot('05c-tonnen');

await page.getByRole('button', { name: 'Grundlagen' }).click();
check('Grundlagen zeigen die Tragweiten',
  await page.getByText('Tragweiten', { exact: false }).count() > 0);

// --- Logbuch ---------------------------------------------------------------
await goTab(3);
await page.waitForSelector('main');
check('Logbuch ist ein eigener Bereich',
  (await page.locator('.topbar h1').innerText()).includes('Logbuch'));
check('Ohne Eintrag steht ein Hinweis',
  (await page.locator('main').innerText()).includes('Noch kein Eintrag'));

// Eintrag von Hand
await page.locator('#main input').first().fill('Wind SW 4, 1. Reff');
await page.getByRole('button', { name: /Position jetzt eintragen/ }).click();
await page.waitForSelector('.log-item');
const logText = await page.locator('.log-item').first().innerText();
check('Eintrag angelegt', logText.includes('54°30'), logText.replace(/\n/g, ' | '));
check('Bemerkung übernommen', logText.includes('Wind SW 4'));

// Zweiter Eintrag, damit eine Spur entsteht
await page.getByRole('button', { name: /Position jetzt eintragen/ }).click();
await page.waitForSelector('.track-plot');
check('Spur wird gezeichnet', await page.locator('.track-plot').count() === 1);
check('Linie zwischen den Positionen',
  await page.locator('.track-plot .plot-line').count() === 1);
check('Positionen als Punkte', await page.locator('.track-plot .plot-dot').count() >= 2);

// Takt einstellen
await page.getByRole('button', { name: '10 min', exact: true }).click();
check('Takt ist einstellbar',
  (await page.locator('main').innerText()).includes('Alle 10 min'),
  '');
check('Takt bleibt gespeichert',
  await page.evaluate(() => JSON.parse(localStorage.getItem('sailing-buddy-log')).intervalMinutes) === 10);
await shot('06-logbuch');

// Der eingestellte Takt legt sofort einen Eintrag an – erst danach zählen.
const logBefore = await page.locator('.log-item').count();
page.once('dialog', (d) => d.accept());
await page.locator('.log-item').first().getByRole('button', { name: 'Eintrag löschen' }).click();
await page.waitForTimeout(300);
check('Eintrag wieder löschbar',
  await page.locator('.log-item').count() === logBefore - 1,
  `vorher ${logBefore}, nachher ${await page.locator('.log-item').count()}`);
check('Automatischer Eintrag wurde angelegt', logBefore >= 3, `${logBefore} Einträge`);

await goTab(2);

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
await goTab(4);
await page.waitForSelector('.card');
await page.getByRole('button', { name: 'English' }).first().click();
await page.waitForTimeout(150);
const tabsText = await page.locator('nav.tabs').innerText();
check('Reiter auf Englisch', tabsText.includes('Radio') && tabsText.includes('Settings'), tabsText);
check('Titel auf Englisch', (await page.locator('.topbar h1').innerText()).includes('Settings'));
await shot('07-settings-en');

// Funkspruchsprache blieb davon unberührt (steht noch auf Deutsch).
await goTab(0);
await page.waitForSelector('.phrase-btn');
const firstPhrase = await page.locator('.phrase-btn').first().innerText();
check('Funksprüche unabhängig von der Oberflächensprache',
  firstPhrase.includes('MAYDAY – Notruf'), firstPhrase.replace(/\n/g, ' | '));

await page.getByRole('button', { name: 'Deutsch' }).first().click();

// --- Helligkeit ------------------------------------------------------------
await goTab(4);
await page.locator('input[type="range"]').fill('40');
// Der Dimmer blendet über 0,2 s ein – erst danach steht der Endwert.
await page.waitForTimeout(400);
const dim = await page.locator('#dimmer').evaluate((el) => getComputedStyle(el).opacity);
check('Dimmer greift', Number(dim) > 0.5, `Deckkraft ${dim}`);
check('Dimmer blockiert keine Eingaben',
  await page.locator('#dimmer').evaluate((el) => getComputedStyle(el).pointerEvents) === 'none');
await page.locator('input[type="range"]').fill('100');

// --- Offline-Bereitschaft ---------------------------------------------------
await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 10000 })
  .catch(() => problems.push('Service Worker hat die Seite nicht übernommen'));

// Die App muss selbst nachweisen können, dass sie vollständig im Gerät liegt.
await goTab(4);
await page.waitForSelector('.card');
await page.waitForFunction(
  () => /Fully stored|Vollständig im Gerät/.test(document.body.innerText),
  null, { timeout: 15000 },
).catch(() => problems.push('Offline-Bereitschaft wird nicht als vollständig gemeldet'));
const readiness = await page.locator('.card').first().innerText();
check('App meldet sich als vollständig offline',
  /Fully stored|Vollständig im Gerät/.test(readiness), readiness.split('\n').slice(0, 3).join(' | '));

const missingCount = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.ready;
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = (e) => resolve(e.data);
    reg.active.postMessage({ type: 'CHECK' }, [ch.port2]);
  });
});
check('Keine Datei fehlt im Gerät', missingCount.missing.length === 0,
  `${missingCount.missing.length} von ${missingCount.total}: ${missingCount.missing.join(', ')}`);
check('Offline-Liste ist nicht leer', missingCount.total > 20, `${missingCount.total} Dateien`);

// --- Kaltstart ohne Netz und ohne Server ------------------------------------
// Der schärfste Fall: Die Seite wird geschlossen, der Server abgeschaltet und
// das Netz getrennt. Erst dann wird ein neuer Tab geöffnet. Was jetzt noch
// läuft, läuft wirklich aus dem Gerät.
await shot('08-offline-readiness');
await page.close();
await context.setOffline(true);
server.closeAllConnections?.();
await new Promise((resolve) => server.close(resolve));

const coldPage = await context.newPage();
const netAttempts = [];
coldPage.on('requestfailed', (req) => netAttempts.push(req.url()));
coldPage.on('pageerror', (err) => problems.push(`Ausnahme beim Kaltstart: ${err.message}`));

let coldStarted = true;
await coldPage.goto(base, { waitUntil: 'domcontentloaded' })
  .catch(() => { coldStarted = false; });
await coldPage.waitForSelector('nav.tabs', { timeout: 10000 })
  .catch(() => { coldStarted = false; });

check('Kaltstart ohne Netz und ohne Server', coldStarted,
  netAttempts.length ? `fehlgeschlagene Anfragen: ${netAttempts.slice(0, 3).join(', ')}` : '');
check('Schiffsdaten überstehen den Kaltstart',
  (await coldPage.locator('.boat-tag').innerText().catch(() => '')).includes('SEEBÄR'));

// Auch die Module müssen ohne Netz vollständig da sein.
await coldPage.getByRole('button', { name: 'MAYDAY – Notruf' }).click();
check('Funkspruch offline vollständig',
  (await coldPage.locator('.script').innerText()).includes('MAYDAY SEEBÄR'));
await coldPage.locator('nav.tabs button').nth(2).click();
await coldPage.waitForSelector('.light-card');
check('Lichterführung offline vollständig', await coldPage.locator('.light-card').count() > 10);

if (SHOTS) await coldPage.screenshot({ path: join(SHOT_DIR, '09-kaltstart-offline.png') });

// --- Einzeldatei als Rückfallebene ------------------------------------------
// Immer noch offline und ohne Server: Die gebaute Einzeldatei muss sich direkt
// von der Platte öffnen lassen, ohne Herkunft, ohne Modullader, ohne alles.
const singleFile = join(ROOT, 'dist/sailing-buddy.html');
if (existsSync(singleFile)) {
  const filePage = await context.newPage();
  const fileProblems = [];
  filePage.on('pageerror', (err) => fileProblems.push(err.message));

  await filePage.goto(pathToFileURL(singleFile).href, { waitUntil: 'domcontentloaded' });
  const booted = await filePage.waitForSelector('.setup-hero, nav.tabs', { timeout: 10000 })
    .then(() => true).catch(() => false);
  check('Einzeldatei startet direkt von der Platte', booted,
    fileProblems.slice(0, 2).join(' | '));

  // Sie muss dieselben Inhalte mitbringen – nicht nur eine leere Hülle.
  const hasContent = await filePage.evaluate(() =>
    document.body.innerText.includes('Sailing Buddy')
    || document.body.innerText.includes('Willkommen an Bord'));
  check('Einzeldatei bringt die Inhalte mit', hasContent);
  check('Einzeldatei ohne Ausnahmen', fileProblems.length === 0, fileProblems.slice(0, 2).join(' | '));
  if (SHOTS) await filePage.screenshot({ path: join(SHOT_DIR, '10-einzeldatei.png') });
  await filePage.close();
} else {
  console.log('  --   Einzeldatei nicht gebaut (node tools/build-single-file.mjs), Prüfung übersprungen');
}

// --- Ergebnis --------------------------------------------------------------
await browser.close();

for (const s of steps) {
  console.log(`${s.ok ? '  ok  ' : ' FAIL '} ${s.name}${s.ok || !s.detail ? '' : ` → ${s.detail}`}`);
}

const consoleProblems = problems.filter((p) => !steps.some((s) => !s.ok && p.startsWith(s.name)));
for (const p of consoleProblems) console.log(` FAIL  ${p}`);

const failed = steps.filter((s) => !s.ok).length + consoleProblems.length;
console.log(`\n${steps.length} Prüfungen, ${failed} Fehler`);
process.exit(failed ? 1 : 0);
