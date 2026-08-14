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
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { existsSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Standardmäßig wird das Arbeitsverzeichnis geprüft. Mit SMOKE_ROOT lässt
// sich stattdessen ein zusammengestelltes Website-Verzeichnis prüfen – also
// genau das, was später wirklich veröffentlicht wird.
const require = createRequire(import.meta.url);
const REPO = fileURLToPath(new URL('..', import.meta.url));
const ROOT = process.env.SMOKE_ROOT ? resolve(process.env.SMOKE_ROOT) : REPO;
const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = process.env.SHOT_DIR ?? join(REPO, 'screenshots');

/**
 * Ein kleines, echtes Kartenpaket für den Rauchtest.
 *
 * Der eigentliche Spiegel von OpenSeaMap ist von hier aus nicht erreichbar –
 * also wird ein Paket derselben Bauart erzeugt und über den örtlichen Server
 * ausgeliefert. Geprüft wird damit die ganze Kette: herunterladen, ablegen,
 * die SQLite-Datei lesen und die Kachel auf der Karte zeigen. Nur die Adresse
 * ist eine andere.
 */
/** Ein winziges einfarbiges PNG, von Hand gebaut. */
const TILE_PNG = (() => {
  const zlib = require('node:zlib');
  const chunk = (tag, data) => {
    const body = Buffer.concat([Buffer.from(tag), data]);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.concat([
    Buffer.from([0, 30, 120, 190, 30, 120, 190]),
    Buffer.from([0, 30, 120, 190, 30, 120, 190]),
  ]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
})();

/** Jeder Kachelabruf des örtlichen Servers wird mitgeschrieben. */
const tileHits = [];

const FIXTURE_DIR = mkdtempSync(join(tmpdir(), 'sb-smoke-'));
const FIXTURE = join(FIXTURE_DIR, 'test.mbtiles');
process.on('exit', () => rmSync(FIXTURE_DIR, { recursive: true, force: true }));

function buildFixture() {
  execFileSync('python3', ['-c', `
import sqlite3, os, math, zlib, struct
path = ${JSON.stringify(FIXTURE)}
if os.path.exists(path): os.remove(path)

def png(r, g, b):
    # Ein einfarbiges 2x2-PNG, von Hand gebaut – ohne Bibliothek.
    raw = b''.join(b'\\x00' + bytes([r, g, b]) * 2 for _ in range(2))
    def chunk(tag, data):
        c = tag + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c))
    return (b'\\x89PNG\\r\\n\\x1a\\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', 2, 2, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw))
            + chunk(b'IEND', b''))

def tile_x(lon, z): return int((lon + 180.0) / 360.0 * 2 ** z)
def tile_y(lat, z):
    r = math.radians(lat)
    return int((1.0 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2.0 * 2 ** z)

db = sqlite3.connect(path)
db.execute("CREATE TABLE metadata (name text, value text)")
db.executemany("INSERT INTO metadata VALUES (?,?)", [
    ('name', 'Prüfgebiet Kiel'), ('format', 'png'),
    ('minzoom', '8'), ('maxzoom', '14'),
    ('bounds', '9.8,54.2,10.8,54.8'),
])
db.execute("CREATE TABLE tiles (zoom_level integer, tile_column integer, tile_row integer, tile_data blob)")

# Rund um die Position, die der Test vorgibt: 54,5 N 010,27 O
rows = []
for z in range(8, 15):
    cx, cy = tile_x(10.27, z), tile_y(54.5, z)
    for dx in range(-3, 4):
        for dy in range(-3, 4):
            x, y = cx + dx, cy + dy
            if x < 0 or y < 0: continue
            row = 2 ** z - 1 - y                    # MBTiles zaehlt von unten
            rows.append((z, x, row, png(20, 90 + (z * 10) % 120, 160)))
db.executemany("INSERT INTO tiles VALUES (?,?,?,?)", rows)
db.execute("CREATE UNIQUE INDEX tile_index on tiles (zoom_level, tile_column, tile_row)")
db.commit(); db.close()
print(len(rows), 'Kacheln im Pruefpaket')
`], { stdio: 'inherit' });
  return readFileSync(FIXTURE);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function serve(fixture) {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);

    // Das Prüfpaket kommt aus dem Speicher und beherrscht Bereichsabfragen –
    // genau wie der Dateispiegel, von dem die echten Pakete stammen.
    if (path === '/test.mbtiles' && fixture) {
      const range = /^bytes=(\d+)-/.exec(req.headers.range ?? '');
      const head = {
        'Content-Type': 'application/octet-stream',
        'Accept-Ranges': 'bytes',
      };
      if (range) {
        const from = Number(range[1]);
        const part = fixture.subarray(from);
        res.writeHead(206, {
          ...head,
          'Content-Length': String(part.length),
          'Content-Range': `bytes ${from}-${fixture.length - 1}/${fixture.length}`,
        });
        res.end(part);
        return;
      }
      res.writeHead(200, { ...head, 'Content-Length': String(fixture.length) });
      res.end(fixture);
      return;
    }

    // Ein Kachelweg für die Prüfung des Nachholens – ein einfarbiges PNG.
    if (path.startsWith('/kachel/')) {
      tileHits.push(path);
      res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': String(TILE_PNG.length) });
      res.end(TILE_PNG);
      return;
    }

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

const { server, port } = await serve(buildFixture());
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

// Der Test darf unter keinen Umständen echte Kachelserver anfassen. Abgeklemmt
// statt gehofft – und nebenbei ist damit geprüft, dass die App fehlgeschlagene
// Abrufe verkraftet, statt stehenzubleiben.
const fremdeAbrufe = [];
await context.route('**://tile.openstreetmap.org/**', (route) => {
  fremdeAbrufe.push(route.request().url());
  return route.abort();
});
await context.route('**://tiles.openseamap.org/**', (route) => {
  fremdeAbrufe.push(route.request().url());
  return route.abort();
});

const page = await context.newPage();

/**
 * Ein Kachelabruf, der ins Leere läuft, meldet der Browser von sich aus in
 * der Konsole. Das ist kein Mangel der App, sondern der Fall, für den sie
 * gebaut ist – ohne Netz oder mit einer unerreichbaren Quelle. Alles andere
 * in der Konsole bleibt ein Fehlschlag.
 */
const erwartet = (text) => /net::ERR_|Failed to load resource/.test(text);

page.on('console', (msg) => {
  if (msg.type() === 'error' && !erwartet(msg.text())) {
    problems.push(`Konsolenfehler: ${msg.text()}`);
  }
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

/**
 * Zu einem Bereich wechseln.
 *
 * Über die Kennung statt über die Stelle in der Leiste: Welche fünf Bereiche
 * unten stehen, richtet sich nach der Benutzung – eine feste Nummer träfe
 * nach dem ersten Aufruf aus „Mehr“ den falschen.
 */
const KEYS = ['funk', 'position', 'karte', 'nacht', 'logbuch', 'mehr'];
const goTabOn = async (p, was) => {
  const key = typeof was === 'number' ? KEYS[was] : was;
  await p.evaluate(() => window.scrollTo(0, 0));
  if (await p.locator(`nav.tabs button[data-tab="${key}"]`).count()) {
    await p.locator(`nav.tabs button[data-tab="${key}"]`).click();
    return;
  }
  // Steht er gerade nicht unten, liegt er hinter „Mehr“.
  await p.locator('nav.tabs button[data-tab="mehr"]').click();
  await p.waitForTimeout(200);
  await p.locator(`[data-mod="${key}"]`).click();
};
const goTab = (was) => goTabOn(page, was);

/** Welche Bereiche gerade unten stehen – „Mehr“ nicht mitgezählt. */
const barKeys = async () => (await page.$$eval('nav.tabs button', (bs) => bs.map((b) => b.dataset.tab)))
  .filter((k) => k !== 'mehr');

/** Was gerade hinter „Mehr“ liegt (setzt voraus, dass „Mehr“ offen ist). */
const moreKeys = async () => page.$$eval('.more-item', (bs) => bs.map((b) => b.dataset.mod));

/**
 * Zu den Einstellungen: Sie liegen hinter „Mehr“ und damit einen Griff
 * weiter. Über die Kennung statt über die Beschriftung, damit es auch dann
 * geht, wenn die Oberfläche gerade auf Englisch steht.
 */
const goSettings = async () => {
  await goTab('setup');
  await page.waitForTimeout(200);
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

// Ziffern bleiben Ziffern. Die Zahlwörter des Seefunks sind über schlechtes
// Rauschen sicherer – aber nur, wenn man sie kann. Wer sie vom Blatt abliest
// und dabei stockt, ist mit „eins zwei drei vier“ besser dran.
const rufAusgeschrieben = await page.locator('.script').innerText();
check('Das Rufzeichen wird buchstabiert',
  rufAusgeschrieben.includes('Delta Alfa'),
  rufAusgeschrieben.split('\n').find((l) => /Delta/.test(l)) ?? '');
// Ausgeschrieben heißt ausgeschrieben – auch die Zahlen. Sonst sagte die
// Position „fünf vier Grad“ und die MMSI daneben „5 4“, und wer vorliest,
// springt zwischen zwei Schreibweisen hin und her.
check('Auch die Zahlen sind ausgeschrieben',
  /Delta Alfa eins zwei drei vier/.test(rufAusgeschrieben),
  rufAusgeschrieben.split('\n').find((l) => /Delta/.test(l)) ?? '');
check('Und zwar mit den gewöhnlichen Zahlwörtern, nicht den Seefunkwörtern',
  !/Unaone|Kartefour/.test(rufAusgeschrieben));
check('Die MMSI ebenso',
  /zwei eins eins zwei drei vier/.test(rufAusgeschrieben),
  rufAusgeschrieben.split('\n').find((l) => /MMSI|zwei eins/.test(l)) ?? '');
check('Und die Zahl der Personen an Bord auch',
  /SIND vier PERSONEN/.test(rufAusgeschrieben),
  rufAusgeschrieben.split('\n').find((l) => /PERSONEN/.test(l)) ?? '');

// Wer die Seefunkwörter will, bekommt sie – mit einem Griff.
check('Ein Knopf stellt die Ziffern um',
  await page.locator('#digit-style').count() === 1);
await page.locator('#digit-style').click();
await page.waitForTimeout(200);
const mitWoertern = await page.locator('.script').innerText();
check('Umgestellt stehen die Seefunkwörter da',
  mitWoertern.includes('Unaone') && mitWoertern.includes('Kartefour'),
  mitWoertern.split('\n').find((l) => /Delta/.test(l)) ?? '');
check('Und die Umstellung bleibt gemerkt',
  await page.evaluate(() => JSON.parse(localStorage.getItem('sailing-buddy')).spellNumbers) === true);
await page.locator('#digit-style').click();
await page.waitForTimeout(200);
check('Und wieder zurück',
  (await page.locator('.script').innerText()).includes('eins zwei drei vier')
  && !(await page.locator('.script').innerText()).includes('Unaone'));

await page.getByRole('button', { name: 'Als Zahlen' }).click();
check('Bei Zahlen gibt es nichts umzustellen',
  await page.locator('#digit-style').count() === 0);

// Sprache der Funksprüche umschalten – der Umschalter sitzt oben in der
// Titelleiste, nicht mehr als breite Leiste im Modul.
check('Sprachumschalter steht in der Kopfzeile',
  (await page.locator('.topbar .lang-btn').innerText()).trim() === 'DE');
await page.locator('.topbar .lang-btn').click();
await page.waitForTimeout(200);
const scriptEn = await page.locator('.script').innerText();
check('Funkspruch wechselt auf Englisch', scriptEn.includes('THIS IS SEEBÄR'), scriptEn.slice(0, 60));
check('Der Umschalter zeigt die neue Sprache',
  (await page.locator('.topbar .lang-btn').innerText()).trim() === 'EN');
check('Oberfläche bleibt dabei deutsch',
  await page.getByRole('button', { name: '‹ Zurück' }).isVisible());
await shot('03-mayday-en');

await page.getByRole('button', { name: '‹ Zurück' }).click();
await page.locator('.topbar .lang-btn').click();
await page.waitForTimeout(200);

// --- Sprachaufnahme --------------------------------------------------------
// Die Aufnahme steht jetzt über den Funksprüchen – eine hereinkommende
// Meldung ist schneller vorbei, als man den Reiter findet.
const kartenPos = await page.locator('.rec-card').evaluate(
  (el) => el.getBoundingClientRect().top);
const sprucheePos = await page.locator('.phrase-btn').first().evaluate(
  (el) => el.getBoundingClientRect().top);
check('Aufnehmen steht über den Funksprüchen', kartenPos < sprucheePos,
  `Aufnahme bei ${Math.round(kartenPos)}, erster Spruch bei ${Math.round(sprucheePos)}`);

// Der Aufnahmeknopf ist ein Ring mit rotem Punkt – ein Zeichen, das keiner
// Übersetzung bedarf – mit einer Zeile daneben, die sagt, wofür er gut ist.
check('Der Aufnahmeknopf ist ein eigenes Zeichen',
  await page.locator('.rec-trigger .rec-glyph').count() === 1);
check('Er ist groß genug zum Treffen',
  await page.locator('.rec-trigger').evaluate((el) => Math.round(el.getBoundingClientRect().width)) >= 44,
  `${await page.locator('.rec-trigger').evaluate((el) => Math.round(el.getBoundingClientRect().width))} px`);
check('Daneben steht, wofür er gut ist',
  /mitschneiden/i.test(await page.locator('.rec-teaser').innerText()),
  await page.locator('.rec-teaser').innerText());

const ruhigerTitel = await page.locator('.rec-title').innerText();
await page.locator('.rec-trigger').click();
await page.waitForSelector('.rec-trigger.running', { timeout: 8000 })
  .catch(() => problems.push('Aufnahme startet nicht'));
check('Aufnahme läuft', await page.locator('.rec-trigger.running').count() === 1);
check('Und der Knopf sagt das auch',
  (await page.locator('.rec-title').innerText()).includes('läuft'),
  await page.locator('.rec-title').innerText());
check('Vorher heißt er „Aufnahme starten“', ruhigerTitel === 'Aufnahme starten', ruhigerTitel);
await page.waitForTimeout(1200);
await page.getByRole('button', { name: /Aufnahme beenden/ }).click();
await page.waitForSelector('.rec-item', { timeout: 8000 })
  .catch(() => problems.push('Aufnahme wurde nicht gespeichert'));
check('Aufnahme gespeichert', await page.locator('.rec-item').count() === 1);

// Gedrückt halten und loslassen: wie eine Sprechtaste. Zweimal zu treffen
// ist zweimal zu zielen, und beim zweiten Mal ist die Meldung vorbei.
const knopf = await page.locator('.rec-trigger').boundingBox();
await page.mouse.move(knopf.x + knopf.width / 2, knopf.y + knopf.height / 2);
await page.mouse.down();
await page.waitForTimeout(900);
check('Gedrückt halten nimmt auf',
  await page.locator('.rec-trigger.running').count() === 1);
await page.mouse.up();
await page.waitForTimeout(900);
check('Loslassen beendet die Aufnahme',
  await page.locator('.rec-trigger.running').count() === 0);
check('Und sie ist gespeichert',
  await page.locator('.rec-item').count() === 2,
  `${await page.locator('.rec-item').count()} Aufnahmen`);
page.once('dialog', (d) => d.accept());
await page.locator('.rec-item').first().getByRole('button', { name: 'Aufnahme löschen' }).click();
await page.waitForTimeout(400);
check('Aufnahme hat einen Abspieler', await page.locator('.rec-item audio').count() === 1);
await shot('02c-aufnahme');

// Löschen muss gehen – sonst sammelt sich das an.
// Der eigene Abspieler: Schieberegler zum Vor- und Zurückspulen.
check('Aufnahme hat einen Schieberegler', await page.locator('.rec-seek').count() === 1);
const gespult = await page.locator('.rec-item').evaluate((row) => {
  const regler = row.querySelector('.rec-seek');
  const ton = row.querySelector('audio');
  regler.value = '500';
  regler.dispatchEvent(new Event('input', { bubbles: true }));
  return { stelle: ton.currentTime, dauer: ton.duration };
});
check('Der Regler springt in der Aufnahme vor', gespult.stelle > 0,
  `bei ${gespult.stelle?.toFixed(2)} s`);
check('Der Regler ist groß genug zum Treffen',
  await page.locator('.rec-seek').evaluate((el) => el.getBoundingClientRect().height) >= 28,
  `${await page.locator('.rec-seek').evaluate((el) => Math.round(el.getBoundingClientRect().height))} px hoch`);

page.once('dialog', (d) => d.accept());
await page.locator('.rec-item').getByRole('button', { name: 'Aufnahme löschen' }).click();
await page.waitForTimeout(400);
check('Aufnahme wieder löschbar', await page.locator('.rec-item').count() === 0);

// Die Nachschlagewerke stehen alle eingeklappt da – auch die Buchstabiertafel,
// die längste von allen. Aufgeklappt schöbe sie die übrigen unter den
// Bildrand, und gesucht wird ohnehin gezielt.
const klappen = await page.locator('.foldout').evaluateAll(
  (els) => els.map((el) => el.open));
check('Die Nachschlagewerke sind eingeklappt',
  klappen.length >= 4 && klappen.every((offen) => offen === false),
  `${klappen.filter(Boolean).length} von ${klappen.length} offen`);
check('Die Buchstabiertafel ist erst nach dem Aufklappen da',
  await page.locator('.alphabet').first().isVisible() === false);
await page.locator('summary', { hasText: 'Buchstabier' }).click();
await page.waitForTimeout(250);
check('Und dann steht sie vollständig darin',
  await page.locator('.alphabet div').count() >= 36,
  `${await page.locator('.alphabet div').count()} Felder`);
await page.locator('summary', { hasText: 'Buchstabier' }).click();
await page.waitForTimeout(150);

// Die Verkehrswörter stehen in einer Tabelle, und die lief auf dem Telefon
// rechts aus dem Bild – dorthin kommt man mit dem Daumen nicht.
await page.locator('summary', { hasText: 'Verkehrswörter' }).click();
await page.waitForTimeout(250);
const tabelle = await page.locator('table.data').first().evaluate((el) => {
  const b = el.getBoundingClientRect();
  return {
    rechts: Math.round(b.right),
    breite: Math.round(b.width),
    fenster: window.innerWidth,
    ueberlauf: Math.round(document.documentElement.scrollWidth - document.documentElement.clientWidth),
  };
});
check('Die Verkehrswörter bleiben im Bild',
  tabelle.rechts <= tabelle.fenster, JSON.stringify(tabelle));
check('Und die Seite lässt sich nicht seitwärts schieben',
  tabelle.ueberlauf <= 1, `${tabelle.ueberlauf} px Überlauf`);
await page.locator('summary', { hasText: 'Verkehrswörter' }).click();
await page.waitForTimeout(150);

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
await page.locator('#coord-lonMin').fill('11');
await page.locator('#coord-lonDec').fill('4');
await page.waitForSelector('.compass');
check('Kopfzeilen-Symbol ist sichtbar',
  await page.getByRole('button', { name: 'Nachtmodus umschalten' })
    .locator('svg').evaluate((el) => el.getBoundingClientRect().width) > 10);
// Der Sprachknopf schaltet den Sprechtext um – er gehört dorthin, wo es
// einen gibt, und sonst nirgends.
check('Der Sprachknopf steht nicht auf der Positionsseite',
  await page.locator('.lang-btn').count() === 0);

// Der erste Messwertblock gehört zur eigenen Position, der zweite zum Ergebnis.
const distance = await page.locator('.cell.hero').first().innerText();
check('Entfernung berechnet', /32,4\s*sm/.test(distance.replace(/\n/g, ' ')),
  distance.replace(/\n/g, ' | '));
check('Entfernung mit deutschem Dezimalkomma', distance.includes(','), distance.replace(/\n/g, ' | '));
// SVG-Knoten kennen kein innerText.
const bearing = await page.locator('.compass .center-text').textContent();
check('Kurs im Kompass', bearing === '097°', bearing);
await shot('04-position');

// Buchstaben werden gar nicht erst angenommen, und das volle Minutenfeld
// reicht von selbst ins Kästchen für die Nachkommastellen weiter.
await page.locator('#coord-latMin').fill('a2');
check('Nur Ziffern landen im Feld',
  (await page.locator('#coord-latMin').inputValue()) === '2',
  await page.locator('#coord-latMin').inputValue());
await page.locator('#coord-latMin').fill('26');
const jumped = await page.evaluate(() => document.activeElement?.id);
check('Volles Minutenfeld springt weiter', jumped === 'coord-latDec', jumped);
await page.locator('#coord-latDec').fill('5');
check('Nachkommastellen haben ein eigenes Kästchen',
  (await page.locator('.coord-check').innerText()).includes('26.5')
  || (await page.locator('.coord-check').innerText()).includes("26,5"),
  await page.locator('.coord-check').innerText());
await page.locator('#coord-latDec').fill('');

// Die Beispielwerte in den leeren Feldern dürfen nicht wie eingetragene
// Werte aussehen – sonst rechnet man mit einer Position, die nie eingegeben
// wurde.
await page.locator('#coord-lonDec').fill('');
const platzhalter = await page.locator('#coord-lonDec').evaluate((el) => {
  const wert = getComputedStyle(el);
  const halt = getComputedStyle(el, '::placeholder');
  const zahl = (c) => (c.match(/[\d.]+/g) ?? []).map(Number);
  return {
    wertFarbe: zahl(wert.color).slice(0, 3),
    haltFarbe: zahl(halt.color).slice(0, 3),
    haltDeckung: Number(halt.opacity),
    haltFett: halt.fontWeight,
    wertFett: wert.fontWeight,
  };
});
check('Der Platzhalter ist deutlich blasser als ein Wert',
  platzhalter.haltDeckung <= 0.6, JSON.stringify(platzhalter));
check('Und nicht fett wie ein Wert',
  Number(platzhalter.haltFett) < Number(platzhalter.wertFett),
  `Platzhalter ${platzhalter.haltFett}, Wert ${platzhalter.wertFett}`);
await page.locator('#coord-lonDec').fill('4');

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

// Mensch über Bord steht ganz oben – über der eigenen Position, damit man
// im Ernstfall nicht erst scrollen muss.
const mobY = await page.locator('.mob-card').evaluate((el) => el.getBoundingClientRect().top);
const eigeneY = await page.locator('.posline').evaluate((el) => el.getBoundingClientRect().top);
check('Mensch über Bord steht über der eigenen Position', mobY < eigeneY,
  `MOB bei ${Math.round(mobY)}, eigene Position bei ${Math.round(eigeneY)}`);

const mobBeschriftung = await page.locator('.mob-card .mob-btn').innerText();
check('Die MOB-Taste heißt nur noch „Mensch über Bord“',
  !/merken/i.test(mobBeschriftung), mobBeschriftung);
await page.locator('.mob-card').getByRole('button', { name: /Mensch über Bord/ }).click();
await page.waitForSelector('.mob-row');
const mobRow = await page.locator('.mob-row').innerText();
check('MOB-Position steht direkt unter der Taste', mobRow.includes('MOB'), mobRow.replace(/\n/g, ' | '));
check('MOB-Position zeigt die Koordinaten', /54°30/.test(mobRow), mobRow.replace(/\n/g, ' | '));

// Zweimal drücken heißt: neue Stelle, nicht zweite Person über Bord. Vorher
// legte jeder Druck einen weiteren Eintrag an – der lag unsichtbar im Gerät
// und stand auf der Karte als Geisterflagge herum.
const mobZaehlen = () => page.evaluate(async () => {
  const { waypoints } = await import('./js/lib/storage.js');
  const alle = waypoints.list();
  return { mob: alle.filter((w) => w.kind === 'mob').length, gesamt: alle.length };
});
await page.locator('.mob-card').getByRole('button', { name: /Mensch über Bord/ }).click();
await page.waitForTimeout(300);
const nachZweimal = await mobZaehlen();
check('Zweimal MOB legt keine zweite Position an', nachZweimal.mob === 1,
  `${nachZweimal.mob} MOB-Einträge`);
check('Und es steht auch nur eine Zeile da', await page.locator('.mob-row').count() === 1);

// Sie lässt sich auch nicht als gewöhnliches Ziel danebenlegen – sonst stünde
// sie doch wieder in zwei Listen.
await page.getByRole('button', { name: /Position merken/ }).click();
await page.waitForTimeout(300);
const nachMerken = await mobZaehlen();
check('Die MOB-Position lässt sich nicht ein zweites Mal merken',
  nachMerken.gesamt === nachZweimal.gesamt
  && (await page.locator('.toast').innerText()).includes('steht schon oben'),
  `${nachZweimal.gesamt} → ${nachMerken.gesamt}, Meldung: ${await page.locator('.toast').innerText()}`);

// Anderes Ziel setzen, dann MOB wieder übernehmen.
await page.locator('#coord-latMin').fill('26');
await page.locator('.mob-row').getByRole('button', { name: '→ Als Ziel' }).click();
check('MOB lässt sich wieder als Ziel setzen',
  await page.locator('.mob-row').getByRole('button', { name: '✓ Ist Ziel' }).count() === 1);

// Der Knopf zum Merken muss schon beim Tippen dastehen. Vorher wurde nur das
// Ergebnis darunter aufgefrischt, dieser Bereich nicht – der Knopf erschien
// erst, wenn irgendetwas anderes die Seite neu aufbaute.
await page.locator('#coord-latMin').fill('35');
await page.waitForTimeout(250);
const merkenKnopf = page.getByRole('button', { name: /Position merken/ });
check('Merken steht schon beim Tippen bereit',
  await merkenKnopf.count() === 1 && !(await merkenKnopf.isDisabled()));
check('Der Kompass zeigt gleich mit', await page.locator('.compass').count() === 1);

// „Nach meinem Kurs“ muss auch dann bedienbar sein, wenn kein Kurs über Grund
// anliegt. Eingestellt wird so etwas im Hafen – also genau dann, wenn keiner
// anliegt. Ohne Fahrt nimmt die Rose Nord an, statt auszugrauen.
const kursOben = page.locator('#nav-result').getByRole('button', { name: 'Nach meinem Kurs' });
check('Ohne Kurs über Grund ist „nach meinem Kurs“ trotzdem wählbar',
  await kursOben.count() === 1 && !(await kursOben.isDisabled()));
await kursOben.click();
await page.waitForTimeout(250);
check('Der Schalter bleibt umgelegt',
  await kursOben.getAttribute('aria-pressed') === 'true',
  await kursOben.getAttribute('aria-pressed'));
check('Ohne Fahrt steht Nord oben',
  (await page.locator('.compass .center-sub').first().textContent()) === 'Nord angenommen',
  await page.locator('.compass .center-sub').first().textContent());
check('Und die Rose ist dabei unverdreht',
  await page.locator('.compass g[transform]').first().getAttribute('transform') === 'rotate(0 100 100)',
  await page.locator('.compass g[transform]').first().getAttribute('transform'));
await page.locator('#nav-result').getByRole('button', { name: 'Nach Norden' }).click();
await page.waitForTimeout(200);

// Die Kästchen im Ergebnis müssen stehen bleiben, ob nun ein Kurs über Grund
// anliegt oder nicht. Vorher kamen und gingen sie mit jedem Fix, und alles
// darunter sprang mit.
const feste = page.locator('.readout-fest .cell');
check('Das Ergebnis zeigt immer dieselben sechs Kästchen',
  await feste.count() === 6, `${await feste.count()} Kästchen`);
const beschriftungen = await page.locator('.readout-fest .cell .label').allInnerTexts();
check('Auch ohne Kurs über Grund fehlt keines',
  beschriftungen.some((l) => /Peilung relativ/i.test(l))
  && beschriftungen.some((l) => /Ankunft/i.test(l))
  && beschriftungen.some((l) => /Kompasskurs/i.test(l)),
  beschriftungen.join(' | '));
const werte = await page.locator('.readout-fest .cell .value').allInnerTexts();
check('Was nicht bestimmbar ist, steht als Strich da',
  werte.filter((v) => v.trim() === '–').length === 3, werte.join(' | '));
const kaesten = await feste.evaluateAll((els) => els.map((el) => {
  const b = el.getBoundingClientRect();
  return `${Math.round(b.width)}x${Math.round(b.height)}`;
}));
check('Alle Kästchen sind gleich groß', new Set(kaesten).size === 1, kaesten.join(', '));

// Ohne gültige Eingabe ist er gesperrt statt verschwunden – dann sucht
// niemand, wo er hin ist.
await page.locator('#coord-latDeg').fill('');
await page.waitForTimeout(250);
check('Ohne Eingabe ist Merken gesperrt, nicht weg',
  await merkenKnopf.count() === 1 && await merkenKnopf.isDisabled());
await page.locator('#coord-latDeg').fill('54');
await page.waitForTimeout(250);

// Kein Aufklappfeld mehr für das Einfügen – ein Knopf genügt.
check('Kein Aufklappfeld für das Einfügen mehr',
  (await page.locator('main').innerText()).indexOf('Position aus einer Nachricht') === -1);
check('Einfügen steht als Knopf da',
  await page.getByRole('button', { name: /Einfügen/ }).count() === 1);

// Ein gemerktes Ziel anlegen – und prüfen, dass die MOB-Position dort nicht
// mit auftaucht. Zwei Listen im Ernstfall wären eine zu viel.
page.once('dialog', (d) => d.accept('Ansteuerung Kiel'));
await merkenKnopf.click();
await page.waitForSelector('.wp-item');
const zielListe = await page.locator('.wp-item').allInnerTexts();
check('Gemerktes Ziel steht in der Liste',
  zielListe.some((z) => z.includes('Ansteuerung Kiel')), zielListe.join(' | '));
check('Die MOB-Position steht nicht in der Zielliste',
  !zielListe.some((z) => z.includes('MOB')), zielListe.join(' | '));
check('Gemerkte Position hat einen Übernehmen-Knopf',
  await page.locator('.wp-item').getByRole('button', { name: /Ist Ziel|Als Ziel/ }).count() >= 1);

// Erst ein anderes Ziel setzen – sonst steht dort „Ist Ziel“ und es gibt
// nichts zu übernehmen.
await page.locator('#coord-latMin').fill('26');
await page.waitForTimeout(150);
// Der Knopf muss die Koordinatenfelder wirklich füllen, nicht nur rechnen.
await page.locator('.wp-item').getByRole('button', { name: '→ Als Ziel' }).first().click();
await page.waitForTimeout(200);
check('Übernehmen füllt die Eingabefelder',
  (await page.locator('#coord-latMin').inputValue()) === '35',
  `Minutenfeld: ${await page.locator('#coord-latMin').inputValue()}`);

// Kompass und Karte teilen sich denselben Platz und werden oben umgeschaltet.
check('Zunächst steht dort der Kompass',
  await page.locator('.compass').count() === 1 && await page.locator('.chart').count() === 0);
check('Der Umschalter steht über der Anzeige',
  await page.locator('#nav-result button[data-view="karte"]').count() === 1);

const umschalterY = await page.locator('#nav-result button[data-view="karte"]')
  .evaluate((el) => el.getBoundingClientRect().top);
const kompassY = await page.locator('.compass').evaluate((el) => el.getBoundingClientRect().top);
check('Der Umschalter steht über dem Kompass', umschalterY < kompassY,
  `Umschalter bei ${Math.round(umschalterY)}, Kompass bei ${Math.round(kompassY)}`);

await page.locator('#nav-result button[data-view="karte"]').click();
await page.waitForTimeout(600);
check('Umgeschaltet steht dort die Karte',
  await page.locator('.chart-klein').count() === 1 && await page.locator('.compass').count() === 0);
check('Sie zeigt die eigene Position und das Ziel',
  await page.locator('.chart-mark').count() >= 2,
  `${await page.locator('.chart-mark').count()} Punkte`);

// Der Ausschnitt muss beim Wechsel so liegen, dass beides zugleich zu sehen
// ist – ein Kartenbild, auf dem einer der beiden Punkte draußen liegt, sagt
// nichts.
await page.waitForSelector('.chart-mark.target', { timeout: 10000 });
const beideDrin = await page.evaluate(() => {
  const box = document.querySelector('.chart-klein').getBoundingClientRect();
  const drin = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    const x = b.left + b.width / 2;
    const y = b.top + b.height / 2;
    return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
  };
  return { eigen: drin('.chart-mark.own'), ziel: drin('.chart-mark.target') };
});
check('Beim Wechsel stehen eigene Position und Ziel beide im Bild',
  beideDrin.eigen === true && beideDrin.ziel === true, JSON.stringify(beideDrin));
check('Und die Verbindung dazwischen ist gezeichnet',
  await page.locator('.plot-leg').count() === 1);
check('Das Ziel ist als solches hervorgehoben',
  await page.locator('.chart-mark.target .ring').count() === 1);

check('Auch hier gibt es das Vollbild',
  await page.locator('#nav-result').getByRole('button', { name: 'Karte im Vollbild' }).count() === 1);
await shot('04d-position-karte');

// Die Karte darf beim Tippen nicht verschwinden – sie hängt in derselben
// Karte, die sich bei jedem Zeichen neu aufbaut.
await page.locator('#coord-latMin').fill('28');
await page.waitForTimeout(700);
check('Die Karte übersteht das Tippen',
  await page.locator('.chart-klein').count() === 1);

await page.locator('#nav-result button[data-view="kompass"]').click();
await page.waitForTimeout(300);
check('Und wieder zurück auf den Kompass',
  await page.locator('.compass').count() === 1 && await page.locator('.chart').count() === 0);

// --- Karte -----------------------------------------------------------------
// Die untere Leiste muss unten stehen und dort bleiben. Ein früherer Versuch,
// sie mit translateY(100dvh - 100vh) nachzuführen, schob sie bei jeder
// Bewegung der Adressleiste sichtbar nach oben.
const barBefore = await page.locator('nav.tabs').evaluate((el) => {
  const b = el.getBoundingClientRect();
  return { top: Math.round(b.top), bottom: Math.round(b.bottom), transform: getComputedStyle(el).transform };
});
check('Reiterleiste steht am unteren Rand',
  Math.abs(barBefore.bottom - 844) <= 1, JSON.stringify(barBefore));
check('Reiterleiste wird nicht verschoben', barBefore.transform === 'none', barBefore.transform);
await page.evaluate(() => window.scrollTo(0, 700));
await page.waitForTimeout(200);
const barAfter = await page.locator('nav.tabs').evaluate(
  (el) => Math.round(el.getBoundingClientRect().top));
check('Reiterleiste bleibt beim Scrollen liegen', barAfter === barBefore.top,
  `vorher ${barBefore.top}, nachher ${barAfter}`);
await page.evaluate(() => window.scrollTo(0, 0));

// Sechs Reiter auf einem schmalen Gerät: Kein Wort darf abgeschnitten werden.
const tabFit = await page.locator('nav.tabs button').evaluateAll((els) => els.map((el) => {
  const span = el.querySelector('span');
  return { text: span.textContent, over: span.scrollWidth - (el.clientWidth - 2) };
}));
const cut = tabFit.filter((x) => x.over > 0);
check('Kein Reiterwort wird abgeschnitten', cut.length === 0,
  cut.map((x) => `${x.text} +${x.over}px`).join(', '));

await goTab(2);
await page.waitForSelector('.chart');
check('Karte ist ein eigener Bereich',
  (await page.locator('.topbar h1').innerText()).includes('Karte'));

// Die eigene und die gemerkte MOB-Position stehen beide darauf.
const chartMarks = await page.locator('.chart-mark').count();
check('Eigene und gemerkte Positionen auf der Karte', chartMarks >= 2,
  `${chartMarks} Punkte`);
check('Eigene Position ist als solche gekennzeichnet',
  await page.locator('.chart-mark.own').count() === 1);
check('MOB-Position ist auf der Karte', await page.locator('.chart-mark.mob').count() >= 1);
check('Die Liste nennt Entfernung und Kurs',
  await page.locator('.wp-dist').count() >= 1);

// Auf der Kartenseite hat die Karte Vorrang, aber nicht den ganzen Bildschirm:
// Seit es das Vollbild gibt, darf sie wieder etwas kleiner sein, damit die
// Liste darunter angerissen ist und der Daumen die Seite scrollen kann, ohne
// die Karte zu verschieben. Abschaltbar ist sie nicht – sie ist ja der Zweck
// der Seite.
const chartHoehe = await page.locator('.chart-gross').evaluate(
  (el) => Math.round(el.getBoundingClientRect().height));
check('Die Karte ist groß genug', chartHoehe >= 300, `${chartHoehe} px hoch`);
check('Aber nicht mehr bildschirmfüllend', chartHoehe <= 440, `${chartHoehe} px hoch`);
const listeOben = await page.locator('.card', { hasText: 'Auf der Karte' })
  .first().evaluate((el) => Math.round(el.getBoundingClientRect().top));
check('Unter der Karte fängt die Liste noch im Bild an', listeOben < 844 - 120,
  `Liste beginnt bei ${listeOben} px`);
check('Kein Ein- und Ausschalten der Seekarte auf der Kartenseite',
  await page.getByRole('button', { name: /Seekarte/ }).count() === 0);
check('Die Bedienung liegt auf der Karte',
  await page.locator('.chart-frame .chart-controls .chart-btn').count() >= 4);

// Ziehen muss die Karte wirklich verschieben – und zwar weiter als den einen
// Fingerbreit, nach dem sie früher festklebte: Das Neuzeichnen hängte damals
// frische Handler mit leerer Zeigerliste an, und jede weitere Bewegung lief
// ins Leere.
const kartenBox = await page.locator('.chart-gross').evaluate((el) => {
  const b = el.getBoundingClientRect();
  return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) };
});
const vorherMitte = await page.evaluate(() => {
  const g = document.querySelector('.chart-mark.own');
  if (!g) return null;
  const b = g.getBoundingClientRect();
  return Math.round(b.left + b.width / 2);
});
await page.mouse.move(kartenBox.x, kartenBox.y);
await page.mouse.down();
// In vielen kleinen Schritten, so wie ein Finger es täte.
for (let i = 1; i <= 12; i += 1) {
  // eslint-disable-next-line no-await-in-loop
  await page.mouse.move(kartenBox.x - i * 8, kartenBox.y);
  // eslint-disable-next-line no-await-in-loop
  await page.waitForTimeout(30);
}
await page.mouse.up();
await page.waitForTimeout(600);
const nachherMitte = await page.evaluate(() => {
  const g = document.querySelector('.chart-mark.own');
  if (!g) return null;
  const b = g.getBoundingClientRect();
  return Math.round(b.left + b.width / 2);
});
check('Die Karte lässt sich vom eigenen Standort wegziehen',
  vorherMitte !== null && nachherMitte !== null && vorherMitte - nachherMitte > 40,
  `eigene Position von ${vorherMitte} nach ${nachherMitte} px`);
await page.getByRole('button', { name: 'Alles zeigen' }).click().catch(() => {});
await page.waitForTimeout(400);

// Vollbild: Die Karte legt sich über alles und lässt sich wieder schließen.
const vollbildKnopf = page.getByRole('button', { name: 'Karte im Vollbild' });
check('Es gibt einen Knopf für das Vollbild', await vollbildKnopf.count() === 1);
const vorherHoch = chartHoehe;
await vollbildKnopf.click();
await page.waitForTimeout(400);
const vollHoehe = await page.locator('.chart-gross').evaluate(
  (el) => Math.round(el.getBoundingClientRect().height));
check('Im Vollbild ist die Karte höher', vollHoehe > vorherHoch,
  `vorher ${vorherHoch} px, im Vollbild ${vollHoehe} px`);
check('Im Vollbild deckt die Karte den Bildschirm',
  await page.locator('.chart-frame.chart-full').evaluate((el) => {
    const b = el.getBoundingClientRect();
    return Math.round(b.top) === 0 && Math.round(b.height) === Math.round(window.innerHeight);
  }));
await shot('04e-karte-vollbild');
await page.getByRole('button', { name: 'Vollbild verlassen' }).click();
await page.waitForTimeout(400);
check('Vollbild lässt sich wieder verlassen',
  await page.locator('.chart-frame.chart-full').count() === 0);

// Die App versucht nachzuholen; die echten Kachelserver sind abgeklemmt.
// Gewartet wird auf die endgültige Aussage, nicht auf eine feste Zeit.
await page.waitForFunction(
  () => /Kein Kartenmaterial/.test(document.querySelector('main')?.innerText ?? ''),
  null, { timeout: 30000 },
).catch(() => {});
check('Ohne erreichbare Quelle wird das gesagt, statt leer zu bleiben',
  (await page.locator('main').innerText()).includes('Kein Kartenmaterial'));
// Kein „Ausnahme:“ in der Liste – fehlgeschlagene Abrufe müssen gefangen
// werden, nicht bis in die Oberfläche durchschlagen.
check('Fehlgeschlagene Abrufe schlagen nicht durch',
  problems.filter((p) => p.startsWith('Ausnahme')).length === 0,
  problems.filter((p) => p.startsWith('Ausnahme')).slice(0, 2).join(' | '));
check('Es wurde überhaupt versucht nachzuholen', fremdeAbrufe.length > 0,
  `${fremdeAbrufe.length} Versuche`);
await shot('04b-karte');

// --- Nachholen unterwegs ---------------------------------------------------
// Ist eine Stelle nicht im Gerät, soll sie mit Verbindung nachgeholt und
// gleich abgelegt werden. Geprüft gegen den örtlichen Kachelweg, damit im
// Test nichts nach draußen geht.
await page.evaluate(async (vorlage) => {
  const { settings } = await import('./js/lib/storage.js');
  settings.update({ tileBaseUrl: vorlage, tileSeamarkUrl: '', autoTiles: true });
}, `${base}kachel/{z}/{x}/{y}.png`);

const vorher = tileHits.length;
// Ein Neuaufbau der Seite genügt: Die Karte holt sich, was ihr fehlt.
await goTab(1);
await goTab(2);
await page.waitForFunction(
  () => document.querySelectorAll('.chart-tile').length > 0,
  null, { timeout: 30000 },
).catch(() => {});

const nachgeholt = await page.locator('.chart-tile').count();
check('Fehlende Kacheln werden aus dem Netz nachgeholt', nachgeholt > 0,
  `${nachgeholt} Kacheln, ${tileHits.length - vorher} Abrufe`);
check('Nachgeholt wird nur der sichtbare Ausschnitt',
  tileHits.length - vorher > 0 && tileHits.length - vorher < 60,
  `${tileHits.length - vorher} Abrufe`);

// Und sie müssen abgelegt worden sein – sonst wäre es beim nächsten Mal
// wieder weg, und genau das soll es ja nicht sein.
const abgelegt = await page.evaluate(async () => {
  const { tileStore } = await import('./js/lib/tiles.js');
  return tileStore.count();
});
check('Nachgeholte Kacheln bleiben im Gerät', abgelegt > 0, `${abgelegt} im Speicher`);

// Ausgeschaltet wird auch nichts geholt.
await page.evaluate(async () => {
  const { settings } = await import('./js/lib/storage.js');
  settings.set('autoTiles', false);
  const { tileStore } = await import('./js/lib/tiles.js');
  await tileStore.clear();
});
const vorAus = tileHits.length;
await goTab(1);
await goTab(2);
await page.waitForTimeout(1500);
check('Ausgeschaltet wird nichts nachgeholt', tileHits.length === vorAus,
  `${tileHits.length - vorAus} Abrufe trotz Schalter aus`);

// Zurück auf die Voreinstellung, damit die folgenden Prüfungen nichts erben.
await page.evaluate(async () => {
  const { settings } = await import('./js/lib/storage.js');
  settings.update({ tileBaseUrl: '', tileSeamarkUrl: '', autoTiles: false });
});

// --- Nachtfahrt ------------------------------------------------------------
await goTab(3);
await page.waitForSelector('.light-card');
const cardsAll = await page.locator('.light-card').count();
check('Lichterliste gefüllt', cardsAll > 10, `${cardsAll} Einträge`);

// Ansichten: Aus welcher Richtung sieht man welche Laternen? Die erste Karte
// ist das Maschinenfahrzeug – von vorn Topplicht und beide Seitenlichter,
// von achtern nur das Hecklicht.
const firstCard = page.locator('.light-card').first();
const lightColors = () => firstCard.locator('.light-view circle')
  .evaluateAll((els) => els.map((el) => el.getAttribute('fill')));
const RED = '#ff453a';
const GREEN = '#32d74b';

const bowColors = await lightColors();
check('Von vorn sind beide Seitenlichter zu sehen',
  bowColors.includes(RED) && bowColors.includes(GREEN), bowColors.join(' '));

await firstCard.locator('.aspect-seg button[data-aspect="stern"]').click();
const sternColors = await lightColors();
check('Von achtern keine Seitenlichter',
  !sternColors.includes(RED) && !sternColors.includes(GREEN), sternColors.join(' '));
check('Von achtern bleibt weniger übrig', sternColors.length < bowColors.length,
  `vorn ${bowColors.length}, achtern ${sternColors.length}`);

await firstCard.locator('.aspect-seg button[data-aspect="beam"]').click();
const beamColors = await lightColors();
check('Querab nur das grüne Seitenlicht',
  beamColors.includes(GREEN) && !beamColors.includes(RED), beamColors.join(' '));
check('Die Ansicht wird auch in Worten erklärt',
  (await firstCard.locator('.aspect-caption').innerText()).length > 20);
await shot('05e-ansichten');

await firstCard.locator('.aspect-seg button[data-aspect="bow"]').click();

// Die Suche steht über den Reitern und ist eingeklappt: Wer nachschlägt,
// blättert; wer sucht, klappt auf.
check('Die Suche steht über den Reitern',
  await page.locator('.filter-bar').count() === 1);
check('Und ist zunächst eingeklappt',
  !(await page.locator('.filter-bar').first().evaluate((el) => el.open)));
await page.locator('.filter-bar summary').first().click();
await page.waitForTimeout(350);
check('Aufgeklappt stehen die Merkmale da',
  await page.locator('.chip[data-facet]').count() > 8,
  `${await page.locator('.chip[data-facet]').count()} Merkmale`);
check('Und zwar nach Gruppen geordnet, wie bei Tage',
  (await page.locator('main').innerText()).includes('Welche Farben siehst du?'));

const facetsBefore = await page.locator('.chip[data-facet]').count();
await page.locator('.chip[data-facet="r"]').click();
await page.waitForTimeout(200);
await page.locator('.chip[data-facet="stack2"]').click();
await page.waitForTimeout(200);
const facetsAfter = await page.locator('.chip[data-facet]').count();
check('Unmögliche Merkmale fallen weg', facetsAfter < facetsBefore,
  `vorher ${facetsBefore}, nachher ${facetsAfter}`);

// Die Treffer stehen unmittelbar darunter, ohne dass man etwas schließen muss.
const resultCount = await page.locator('.light-card').count();
check('Die Treffer stehen sofort darunter', resultCount > 0 && resultCount < cardsAll,
  `${resultCount} von ${cardsAll}`);
check('Und die Zahl steht dabei',
  (await page.locator('main').innerText()).includes(`${resultCount} mögliche`),
  (await page.locator('main').innerText()).split('\n').find((l) => /mögliche/.test(l)) ?? '');
await shot('05-lichtersuche');
await shot('05b-lights');

// Seezeichen müssen in derselben Suche auftauchen – nachts weiß man ja
// gerade nicht, ob da ein Schiff fährt oder eine Tonne liegt.
await page.locator('.filter-bar').getByRole('button', { name: /zurücksetzen/ }).click();
await page.waitForTimeout(250);
await page.locator('.chip[data-facet="w"]').click();
await page.waitForTimeout(200);
await page.locator('.chip[data-facet="quick"]').click();
await page.waitForTimeout(200);
await page.locator('.chip[data-facet="longflash"]').click();
await page.waitForTimeout(300);
check('Suche findet auch Seezeichen',
  await page.locator('.buoy-light').count() === 1,
  `${await page.locator('.buoy-light').count()} Treffer`);
check('Gefundenes Seezeichen ist das Südzeichen',
  (await page.locator('main').innerText()).includes('Südzeichen'));
await shot('05d-suche-tonne');

await page.locator('.filter-bar').getByRole('button', { name: /zurücksetzen/ }).click();
await page.waitForTimeout(250);
check('Filter lässt sich zurücksetzen',
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

// --- Tagfahrt: dieselbe Sache, andere Mittel -------------------------------
// Ein Fahrzeug sagt bei Tag und bei Nacht dasselbe, nur mit anderen Zeichen.
// Deshalb liegen beide in einem Bereich und werden oben umgeschaltet.
check('Der Bereich heißt nicht mehr nur Nachtfahrt',
  (await page.locator('.topbar h1').innerText()).includes('Lichter & Zeichen'),
  await page.locator('.topbar h1').innerText());
check('Oben steht der Umschalter für Tag und Nacht',
  await page.locator('button[data-mode="tag"]').count() === 1);

await page.locator('button[data-mode="tag"]').click();
await page.waitForSelector('.light-card', { timeout: 10000 });
check('Bei Tage gibt es die Signalkörper',
  await page.getByRole('button', { name: 'Körper', exact: true }).count() === 1);
check('Und die Lichter-Reiter sind weg',
  await page.getByRole('button', { name: 'Lichter', exact: true }).count() === 0);
check('Tonnen, Tafeln und Schall stehen daneben',
  await page.getByRole('button', { name: 'Tonnen', exact: true }).count() === 1
  && await page.getByRole('button', { name: 'Tafeln', exact: true }).count() === 1
  && await page.getByRole('button', { name: 'Schall', exact: true }).count() === 1);
// Fünf Reiter müssen auf ein iPhone passen, ohne rechts aus dem Bild zu laufen.
// Läuft etwas über, soll die Meldung sagen was – sonst sucht man von Hand.
const reiterBreite = await page.evaluate(() => {
  const ueberlauf = Math.round(document.documentElement.scrollWidth
    - document.documentElement.clientWidth);
  let schuldig = null;
  if (ueberlauf > 1) {
    document.querySelectorAll('main *').forEach((el) => {
      const b = el.getBoundingClientRect();
      if (b.right <= window.innerWidth + 1) return;
      if (schuldig && schuldig.rechts >= Math.round(b.right)) return;
      schuldig = {
        was: `${el.tagName.toLowerCase()}.${(el.className.baseVal ?? el.className ?? '').toString().split(' ').slice(0, 2).join('.')}`,
        rechts: Math.round(b.right),
        text: (el.textContent ?? '').trim().slice(0, 24),
      };
    });
  }
  return {
    seg: Math.round(document.querySelector('main .seg').getBoundingClientRect().width),
    fenster: window.innerWidth,
    ueberlauf,
    schuldig,
  };
});
check('Und die fünf Reiter bleiben im Bild',
  reiterBreite.ueberlauf <= 1 && reiterBreite.seg <= reiterBreite.fenster,
  JSON.stringify(reiterBreite));

const koerper = await page.locator('.light-card').count();
check('Die Signalkörper sind gelistet', koerper >= 10, `${koerper} Karten`);
check('Jede Karte hat eine Zeichnung',
  await page.locator('.day-view').count() === koerper,
  `${await page.locator('.day-view').count()} Zeichnungen bei ${koerper} Karten`);
check('Der Kegel für die Maschinenfahrt ist dabei',
  (await page.locator('main').innerText()).includes('Segelfahrzeug unter Maschine'));
check('Und der Ankerball',
  (await page.locator('main').innerText()).includes('Fahrzeug vor Anker'));

// Suchen nach dem, was man sieht – nicht nach dem Namen des Fahrzeugs.
await page.getByRole('button', { name: 'Ball', exact: true }).first().click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Drei Körper', exact: true }).click();
await page.waitForTimeout(300);
const dreiBaelle = await page.locator('.light-card').count();
check('Die Suche nach Form und Anzahl grenzt ein',
  dreiBaelle > 0 && dreiBaelle < koerper, `${dreiBaelle} von ${koerper}`);
check('Drei Bälle führen zum Fahrzeug auf Grund',
  (await page.locator('main').innerText()).includes('auf Grund'),
  (await page.locator('main').innerText()).split('\n').filter((l) => /Fahrzeug/.test(l)).join(' | '));
await page.getByRole('button', { name: /Filter zurücksetzen|Alles zeigen|zurücksetzen/ }).first().click()
  .catch(() => {});
await page.waitForTimeout(300);
await shot('05d-signalkoerper');

// Die Flaggen stehen bei den Körpern: Beides hängt das Fahrzeug auf, um
// etwas zu sagen – nur aus Tuch statt aus Holz.
const flaggen = await page.locator('.flag-card').count();
check('Die Flaggen sind gezeichnet, nicht beschrieben', flaggen >= 8, `${flaggen} Flaggen`);
check('Jede Flagge hat ihr Bild',
  await page.locator('.flag-view').count() === flaggen);
check('Alfa steht für den Taucher',
  (await page.locator('main').innerText()).includes('Taucher unten'));
await shot('05e-flaggen');

// --- Farben im Filter: Tonnen und Tafeln kommen dazu -----------------------
// Bei Tage ist die Farbe das Erste, was man sieht. Wer nach Rot sucht, will
// nicht nur schwarze Signalkörper angeboten bekommen.
// Die Suche steht auch bei Tage über den Reitern und ist eingeklappt.
check('Auch bei Tage steht die Suche über den Reitern',
  await page.locator('.filter-bar').count() === 1);
if (!(await page.locator('.filter-bar').first().evaluate((el) => el.open))) {
  await page.locator('.filter-bar summary').first().click();
  await page.waitForTimeout(350);
}
const farbe = page.locator('.filter-bar .chip[data-facet="r"]');
check('Der Filter fragt zuerst nach der Farbe', await farbe.count() === 1);
check('Und zeigt den Farbtupfer dazu',
  await farbe.locator('.swatch').count() === 1);
await farbe.click();
await page.waitForTimeout(400);
const rotText = await page.locator('main').innerText();
check('Rot bringt Tonnen in die Liste',
  await page.locator('.buoy-day').count() > 0,
  `${await page.locator('.buoy-day').count()} Tonnen`);
check('Und Tafeln vom Ufer',
  await page.locator('.sign-card').count() > 0,
  `${await page.locator('.sign-card').count()} Tafeln`);
check('Bei Tage steht bei der Tonne die Farbfolge statt der Kennung',
  !/Ununterbrochen funkelnd/.test(rotText),
  rotText.split('\n').filter((l) => /funkelnd/.test(l)).join(' | '));

await page.locator('.filter-bar .chip[data-facet="b"]').click();
await page.waitForTimeout(400);
check('Zwei Farben grenzen weiter ein',
  await page.locator('.light-card, .sign-card').count() > 0);

// Die Auswahl gilt über die Reiter hinweg: Was man sieht, hat keinen Reiter.
await page.getByRole('button', { name: 'Tonnen', exact: true }).click();
await page.waitForTimeout(400);
check('Die Auswahl gilt auch im Reiter Tonnen',
  (await page.locator('.filter-bar summary').innerText()).includes('gewählt'),
  await page.locator('.filter-bar summary').innerText());
check('Und grenzt die Tonnen darin ein',
  await page.locator('.buoy-light').count() < 12,
  `${await page.locator('.buoy-light').count()} von 12`);
await page.getByRole('button', { name: 'Körper', exact: true }).click();
await page.waitForTimeout(400);

await page.locator('.filter-bar').getByRole('button', { name: /zurücksetzen/ }).click()
  .catch(() => {});
await page.waitForTimeout(300);

// --- Tafeln am Ufer --------------------------------------------------------
await page.getByRole('button', { name: 'Tafeln', exact: true }).click();
await page.waitForSelector('.sign-card');
const tafeln = await page.locator('.sign-card').count();
check('Die Tafeln am Ufer sind gelistet', tafeln >= 15, `${tafeln} Tafeln`);
check('Jede hat ihre gezeichnete Tafel',
  await page.locator('.sign-plate').count() === tafeln);
check('Das Fahrverbot ist dabei',
  (await page.locator('main').innerText()).includes('Fahrverbot'));
check('Und die Geschwindigkeitsbeschränkung',
  (await page.locator('main').innerText()).includes('Geschwindigkeit beschränken'));
check('Die vier Klassen stehen als Überschriften da',
  (await page.locator('main').innerText()).includes('Verbot')
  && (await page.locator('main').innerText()).includes('Hinweis'));
check('Die Notzeichen bei Tage stehen auch hier',
  (await page.locator('main').innerText()).includes('Orangefarbenes Rauchsignal'));
await shot('05f-tafeln');

// --- Tonnen bei Tage -------------------------------------------------------
await page.getByRole('button', { name: 'Tonnen', exact: true }).click();
await page.waitForSelector('.buoy-day');
check('Bei Tage zeigen die Tonnen ihre Farbbänder',
  await page.locator('.buoy-band').count() >= 12,
  `${await page.locator('.buoy-band').count()} Bänder`);
check('Und keine Feuerkennung',
  await page.locator('.rhythm-bar').count() === 0,
  `${await page.locator('.rhythm-bar').count()} Kennungsbalken`);

// Schall und Grundlagen gelten bei Tag wie bei Nacht und bleiben deshalb da.
check('Schall bleibt in beiden Betriebsarten',
  await page.getByRole('button', { name: 'Schall', exact: true }).count() === 1);

await page.locator('button[data-mode="nacht"]').click();
await page.waitForTimeout(300);
check('Und zurück zur Nachtfahrt',
  await page.getByRole('button', { name: 'Lichter', exact: true }).count() === 1);

// --- Logbuch ---------------------------------------------------------------
await goTab(4);
await page.waitForSelector('main');
check('Logbuch ist ein eigener Bereich',
  (await page.locator('.topbar h1').innerText()).includes('Logbuch'));
// Der MOB-Druck von der Positionsseite steht hier ohne Zutun: Wer gerade
// jemanden aus dem Wasser holt, führt kein Logbuch.
check('Der MOB-Druck steht ohne Zutun im Logbuch',
  (await page.locator('.log-item').first().innerText()).includes('Mensch über Bord'),
  (await page.locator('.log-item').first().innerText()).replace(/\n/g, ' | '));

// Eintrag von Hand
await page.locator('#main input').first().fill('Wind SW 4, 1. Reff');
await page.getByRole('button', { name: /Position jetzt eintragen/ }).click();
await page.waitForSelector('.log-item');
const logText = await page.locator('.log-item').first().innerText();
check('Eintrag angelegt', logText.includes('54°30'), logText.replace(/\n/g, ' | '));
check('Bemerkung übernommen', logText.includes('Wind SW 4'));

// Zweiter Eintrag, damit eine Spur entsteht
await page.getByRole('button', { name: /Position jetzt eintragen/ }).click();
// Die Spur liegt jetzt auf derselben Karte wie im Kartenreiter – ohne
// Kartenmaterial bleibt der Grund leer, die Spur steht trotzdem darauf.
await page.waitForSelector('.chart-frame .chart-plot');
check('Spur wird auf der Karte gezeichnet',
  await page.locator('.chart-frame').count() >= 1);
check('Linie zwischen den Positionen',
  await page.locator('.chart-plot .plot-line').count() === 1);
check('Anfang und letzte Position sind markiert',
  await page.locator('.chart-plot .chart-mark').count() >= 2,
  `${await page.locator('.chart-plot .chart-mark').count()} Marken`);

// --- Törn: die Klammer um die Einträge -------------------------------------
// Ohne sie ist das Logbuch ein endloser Strom, in dem die Fahrt von letztem
// Juni und die von heute Morgen dieselbe Spur bilden.
const antworten = ['Ostsee 2026', 'Kiel'];
const aufDialog = (d) => d.accept(antworten.shift() ?? '');
page.on('dialog', aufDialog);
await page.getByRole('button', { name: /Törn beginnen/ }).click();
await page.waitForTimeout(500);
page.off('dialog', aufDialog);

check('Der Törn läuft', (await page.locator('.trip-name').innerText()).includes('Ostsee 2026'),
  await page.locator('.trip-name').innerText());
check('Sein Beginn steht als Ablegen im Logbuch',
  (await page.locator('.log-item').first().innerText()).includes('Ablegen'),
  (await page.locator('.log-item').first().innerText()).replace(/\n/g, ' | '));
check('Und die Liste zeigt nur noch diesen Törn',
  !(await page.locator('main').innerText()).includes('Mensch über Bord'));

await page.getByRole('button', { name: 'Alles', exact: true }).click();
await page.waitForTimeout(250);
check('„Alles“ zeigt wieder das ganze Logbuch',
  (await page.locator('main').innerText()).includes('Mensch über Bord'));
await page.getByRole('button', { name: 'Ostsee 2026', exact: true }).first().click();
await page.waitForTimeout(250);

// --- Ereignisse mit einem Griff --------------------------------------------
await page.getByRole('button', { name: /Anker fällt/ }).click();
await page.waitForTimeout(300);
check('Ein Ereignis lässt sich mit einem Griff eintragen',
  (await page.locator('.log-item').first().innerText()).includes('Anker fällt'),
  (await page.locator('.log-item').first().innerText()).replace(/\n/g, ' | '));
check('Das Ereignis bekommt sein Zeichen in der Spur',
  await page.locator('.chart-plot .plot-event').count() >= 1,
  `${await page.locator('.chart-plot .plot-event').count()} Zeichen`);

// --- Wetter ----------------------------------------------------------------
// Ein Logbuch ohne Wetter ist keins. Alles zum Antippen, und was einmal
// eingetragen ist, gilt weiter – sonst tippt man alle zwanzig Minuten
// dieselbe Windstärke neu.
await page.locator('summary', { hasText: 'Wetter eintragen' }).click();
await page.waitForTimeout(200);
await page.locator('[data-weather="windDir"]').getByRole('button', { name: 'SW', exact: true }).click();
await page.waitForTimeout(200);
await page.locator('[data-weather="windForce"]').getByRole('button', { name: '5', exact: true }).click();
await page.waitForTimeout(200);
await page.locator('[data-weather="sea"]').getByRole('button', { name: '3', exact: true }).click();
await page.waitForTimeout(200);
check('Der Wetterstand steht in der Zusammenfassung',
  /SW 5/.test(await page.locator('main').innerText()),
  (await page.locator('main').innerText()).split('\n').filter((l) => /Wetter/.test(l)).join(' | '));

await page.getByRole('button', { name: /Wende/ }).click();
await page.waitForTimeout(300);
const mitWetter = await page.locator('.log-item').first().innerText();
check('Das Wetter geht in den Eintrag ein', /SW 5/.test(mitWetter) && /See 3/.test(mitWetter),
  mitWetter.replace(/\n/g, ' | '));

await page.getByRole('button', { name: /Position jetzt eintragen/ }).click();
await page.waitForTimeout(300);
check('Und wird fortgeschrieben, ohne es neu einzutippen',
  /SW 5/.test(await page.locator('.log-item').first().innerText()),
  (await page.locator('.log-item').first().innerText()).replace(/\n/g, ' | '));

// --- Takt und die Schwelle für den Stillstand ------------------------------
const vorTakt = await page.locator('.log-item').count();
await page.getByRole('button', { name: '10 min', exact: true }).click();
await page.waitForTimeout(600);
check('Takt ist einstellbar',
  (await page.locator('main').innerText()).includes('Alle 10 min'));
check('Takt bleibt gespeichert',
  await page.evaluate(() => JSON.parse(localStorage.getItem('sailing-buddy-log')).intervalMinutes) === 10);

// Im Hafen liegt das Schiff still. Der Takt greift beim Einstellen sofort –
// ohne diese Schwelle stapelte er über Nacht hundert Einträge an derselben
// Stelle, und die Spur wäre ein Fleck.
const beiStillstand = await page.locator('.log-item').count();
check('Bei Stillstand legt der Takt nichts an', beiStillstand === vorTakt,
  `vorher ${vorTakt}, nachher ${beiStillstand}`);

await page.getByRole('button', { name: 'Nur bei Fahrt', exact: true }).click();
await page.waitForTimeout(500);
check('Ausgeschaltet trägt der Takt auch im Stillstand ein',
  await page.locator('.log-item').count() === beiStillstand + 1,
  `${beiStillstand} → ${await page.locator('.log-item').count()}`);
check('Der so entstandene Eintrag ist als automatisch gekennzeichnet',
  (await page.locator('.log-item').first().innerText()).includes('auto'),
  (await page.locator('.log-item').first().innerText()).replace(/\n/g, ' | '));
await page.getByRole('button', { name: 'Nur bei Fahrt', exact: true }).click();
await shot('06-logbuch');

// --- Etappen: eine Ebene unter dem Törn ------------------------------------
// Mehrere Einträge sind eine Etappe, mehrere Etappen ein Törn. Ohne diese
// Klammer sagt „312 Seemeilen“ nichts; mit ihr steht daneben, in wie vielen
// Schlägen und wie lang der längste war.
const antwortenEt = ['Kiel – Marstal', 'Kiel'];
const aufDialogEt = (d) => d.accept(antwortenEt.shift() ?? '');
page.on('dialog', aufDialogEt);
await page.getByRole('button', { name: /Etappe beginnen/ }).click();
await page.waitForTimeout(500);
page.off('dialog', aufDialogEt);

check('Die Etappe läuft',
  (await page.locator('.turn-row').innerText()).includes('Kiel – Marstal'),
  (await page.locator('.turn-row').innerText()).replace(/\n/g, ' | '));
check('Sie steht im Umschalter unter ihrem Törn',
  (await page.locator('.chip-sub').first().innerText()).includes('Kiel – Marstal'),
  await page.locator('.chip-sub').first().innerText());

const inEtappe = await page.locator('.log-item').count();
await page.getByRole('button', { name: /Motor an/ }).click();
await page.waitForTimeout(300);
check('Ein Eintrag landet in der laufenden Etappe',
  await page.locator('.log-item').count() === inEtappe + 1,
  `${inEtappe} → ${await page.locator('.log-item').count()}`);
check('Und trägt sie auch im Speicher',
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('sailing-buddy-log'));
    return d.entries[0].turnId === d.currentTurnId && d.currentTurnId !== null;
  }));

// Der Umschalter bestimmt, worauf sich alles bezieht.
const inTrip = await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('sailing-buddy-log'));
  return d.entries.filter((e) => e.tripId === d.currentTripId).length;
});
await page.locator('[data-scope="wahl"] button').nth(1).click();
await page.waitForTimeout(400);
check('Auf den Törn umgeschaltet stehen mehr Einträge da',
  await page.locator('.log-item').count() === inTrip,
  `Törn: ${await page.locator('.log-item').count()}, erwartet ${inTrip}`);
await page.locator('.chip-sub').first().click();
await page.waitForTimeout(400);
check('Und auf die Etappe zurück nur ihre eigenen',
  await page.locator('.log-item').count() < inTrip,
  `${await page.locator('.log-item').count()} von ${inTrip}`);

// Die Kennzahlen: acht Kästchen, gleich groß, mit dem Namen des Ausschnitts.
const zahlen = page.locator('.readout-fest .cell');
check('Zu jedem Ausschnitt gibt es Kennzahlen',
  await zahlen.count() === 8, `${await zahlen.count()} Kästchen`);
const zahlenText = await page.locator('.readout-fest').innerText();
check('Darunter Strecke, Schnitt über Grund und Motorstunden',
  /strecke/i.test(zahlenText) && /über grund/i.test(zahlenText) && /motor gelaufen/i.test(zahlenText),
  zahlenText.replace(/\n/g, ' | ').slice(0, 160));
check('Der Ausschnitt steht als Merkmal an der Spur',
  (await page.locator('.card', { has: page.locator('.chart-frame') }).locator('.rule').first().innerText())
    .includes('Kiel – Marstal'));
const zahlenGroesse = await zahlen.evaluateAll((els) => els.map((el) => {
  const b = el.getBoundingClientRect();
  return `${Math.round(b.width)}x${Math.round(b.height)}`;
}));
check('Auch hier sind alle Kästchen gleich groß',
  new Set(zahlenGroesse).size === 1, zahlenGroesse.join(', '));

// Motorstunden kommen aus den Ereignissen, nicht aus einer zweiten Quelle.
await page.getByRole('button', { name: /Motor aus/ }).click();
await page.waitForTimeout(400);
check('Motorstunden werden aus „an“ und „aus“ gerechnet',
  !/motor gelaufen\s*\n\s*–/i.test(await page.locator('.readout-fest').innerText()),
  (await page.locator('.readout-fest').innerText()).replace(/\n/g, ' | ').slice(0, 200));

await shot('06b-etappen');

// --- Ausgabe als Datei -----------------------------------------------------
// In die Zwischenablage nützt ein Logbuch niemandem: Fünfhundert Einträge
// lassen sich auf einem Telefon nirgends einfügen.
//
// Ausgegeben wird, was gerade gewählt ist – hier der ganze Törn, damit auch
// die Ereignisse der ersten Etappe mit hineinkommen.
await page.locator('[data-scope="wahl"] button').nth(1).click();
await page.waitForTimeout(400);
const [gpxDatei] = await Promise.all([
  page.waitForEvent('download'),
  page.getByRole('button', { name: /GPX/ }).click(),
]);
check('GPX kommt als Datei heraus', /\.gpx$/.test(gpxDatei.suggestedFilename()),
  gpxDatei.suggestedFilename());
const gpxText = readFileSync(await gpxDatei.path(), 'utf8');
check('Und ist wirklich ein GPX',
  gpxText.includes('<gpx version="1.1"') && gpxText.includes('<trkpt '),
  gpxText.split('\n').slice(0, 2).join(' | '));
check('Die Ereignisse stehen als eigene Punkte darin',
  gpxText.includes('<wpt ') && gpxText.includes('anchorDown'),
  `${(gpxText.match(/<wpt /g) ?? []).length} Marken`);
check('Der Dateiname trägt den Törn',
  gpxDatei.suggestedFilename().startsWith('Ostsee-2026'), gpxDatei.suggestedFilename());

const [csvDatei] = await Promise.all([
  page.waitForEvent('download'),
  page.getByRole('button', { name: /Tabelle/ }).click(),
]);
const csvText = readFileSync(await csvDatei.path(), 'utf8');
check('Die Tabelle führt das Wetter mit',
  csvText.split('\n')[0].includes('wind_bft') && /"SW"/.test(csvText),
  csvText.split('\n')[0]);

// --- Das Schiff fährt ------------------------------------------------------
// Bis hierher lag es an einer Stelle: gut für die Prüfungen zum Stillstand,
// aber eine Spur aus lauter demselben Punkt ist keine. Ein Schlag nach
// Nordost, damit Strecke, Zeichnung und Maßstab etwas zu tun bekommen.
const kurs = [
  [54.512, 10.295], [54.528, 10.331], [54.547, 10.372], [54.561, 10.418],
  [54.573, 10.469], [54.588, 10.523], [54.601, 10.574], [54.614, 10.630],
];
for (const [lat, lon] of kurs) {
  await context.setGeolocation({ latitude: lat, longitude: lon, accuracy: 8 });
  await page.waitForTimeout(160);
  await page.getByRole('button', { name: /Position jetzt eintragen/ }).click();
  await page.waitForTimeout(160);
}
await page.waitForTimeout(300);
check('Die gefahrene Strecke steht in den Kennzahlen',
  /\d+,\d\s*sm/.test(await page.locator('main').innerText()),
  (await page.locator('main').innerText()).split('\n').find((l) => /sm/.test(l)) ?? '');

// --- Meilenbestätigung -----------------------------------------------------
// Ein Blatt, das jemand unterschreibt: Die Zahlen darauf kommen aus dem
// Logbuch und nirgends sonst, und ohne Namen wird gar keins ausgestellt.
await page.locator('summary', { hasText: 'Meilenbestätigung' }).click();
await page.waitForTimeout(250);

// Aufgeklappt heißt aufgeklappt.
//
// Das Logbuch zeichnet sich neu, sobald ein Eintrag dazukommt, und der
// Empfänger meldete sich jede Sekunde – damit fiel das Feld mitten im
// Ausfüllen wieder zu, immer wieder.
await page.locator('[data-miles="person"]').fill('Probe');
await page.evaluate(() => window.dispatchEvent(new CustomEvent('sb:settings')));
await page.getByRole('button', { name: /Wende/ }).click();
await page.waitForTimeout(500);
check('Die Meilenbestätigung bleibt beim Mitschreiben offen',
  await page.locator('[data-fold="miles"]').first().evaluate((el) => el.open));
check('Und was schon eingetragen war, steht noch da',
  await page.locator('[data-miles="person"]').inputValue() === 'Probe',
  await page.locator('[data-miles="person"]').inputValue());
// Wieder leeren: Die nächste Prüfung will wissen, was ohne Namen passiert.
await page.locator('[data-miles="person"]').fill('');

check('Die Bestätigung fragt nach zwei Namen',
  await page.getByText('Für wen ist die Bestätigung?').count() === 1
  && await page.getByText('Wer bestätigt?').count() === 1);

// Ohne Namen darf nichts entstehen.
await page.locator('#miles-make').click();
await page.waitForTimeout(400);
check('Ohne Namen wird keine ausgestellt',
  (await page.locator('.toast').innerText()).includes('Ohne Namen'),
  await page.locator('.toast').innerText());

await page.locator('[data-miles="person"]').fill('Änne Muster');
await page.locator('[data-miles="skipper"]').fill('Moritz Skipper');

// Funktion und Befähigung kommen aus einer Liste. Frei getippt schreibt der
// eine „Crew“, der nächste „Mitsegler“ – nebeneinandergelegt sieht das nach
// zwei verschiedenen Sachen aus, wo zweimal dasselbe gemeint war.
check('Die Funktion an Bord ist eine Auswahl',
  await page.locator('select[data-miles="role"]').count() === 1);
check('Die Befähigung auch',
  await page.locator('select[data-miles="qualification"]').count() === 1);
check('Die Auswahl kennt die üblichen Scheine',
  (await page.locator('select[data-miles="qualification"]').innerText()).includes('SKS'),
  (await page.locator('select[data-miles="qualification"]').innerText()).replace(/\n/g, ' | '));
await page.locator('select[data-miles="role"]').selectOption('crew');
await page.locator('select[data-miles="qualification"]').selectOption('sks');

// „Anderes“ macht ein Textfeld auf – wer eine Funktion hat, die in der Liste
// fehlt, soll sie hinschreiben können statt die falsche zu nehmen.
check('Ohne „Anderes“ bleibt das Textfeld weg',
  !(await page.locator('[data-miles="roleOther"]').isVisible()));
await page.locator('select[data-miles="role"]').selectOption('other');
await page.waitForTimeout(150);
check('„Anderes“ macht ein Textfeld auf',
  await page.locator('[data-miles="roleOther"]').isVisible());
await page.locator('[data-miles="roleOther"]').fill('Backschaft');
await page.locator('select[data-miles="role"]').selectOption('crew');
await page.waitForTimeout(150);

await page.locator('[data-miles="notes"]').fill('Nachtfahrt Kiel–Ærø\nWindstärke 6 aus Südwest');

const [milesDatei] = await Promise.all([
  page.waitForEvent('download'),
  page.locator('#miles-make').click(),
]);
check('Die Bestätigung kommt als PDF heraus',
  /\.pdf$/.test(milesDatei.suggestedFilename()), milesDatei.suggestedFilename());
// Ohne Umlaut im Dateinamen, und zwar aus Not: Chromium wirft den Namen
// weg, sobald ein Zeichen über 127 darin steht, und lädt die Datei als
// „download“ herunter. Wer Änne heißt, bekäme ein Blatt ohne Namen.
check('Und trägt den Namen im Dateinamen',
  /^Meilen-Aenne-Muster-/.test(milesDatei.suggestedFilename()),
  milesDatei.suggestedFilename());
check('Der Dateiname kommt ohne Sonderzeichen aus',
  [...milesDatei.suggestedFilename()].every((ch) => ch.codePointAt(0) < 128),
  milesDatei.suggestedFilename());

const pdfRoh = readFileSync(await milesDatei.path());
const pdfText = pdfRoh.toString('latin1');
check('Die Datei ist ein PDF', pdfText.startsWith('%PDF-1.4'), pdfText.slice(0, 20));
check('Und sie ist vollständig', pdfText.trimEnd().endsWith('%%EOF'),
  pdfText.slice(-30).replace(/\n/g, '\\n'));
check('Die Namen stehen darin',
  pdfText.includes('\u00c4nne Muster') && pdfText.includes('Moritz Skipper'));
check('Das Schiff steht darin', pdfText.includes('SEEB\u00c4R'));
check('Und die Zeile für die Unterschrift',
  pdfText.includes('Unterschrift des Schiffsf\u00fchrers'));
check('Die Meilen stehen als Zahl darauf',
  /\(\d+,\d\)/.test(pdfText), 'keine Zahl mit Dezimalkomma gefunden');

// Der Byteversatz in der Querverweistabelle muss stimmen – sonst öffnet
// mancher Betrachter die Datei, mancher nicht.
const startxref = Number(pdfText.match(/startxref\n(\d+)\n/)[1]);
check('Die Querverweistabelle liegt, wo sie soll',
  pdfText.slice(startxref, startxref + 4) === 'xref',
  `bei ${startxref} steht "${pdfText.slice(startxref, startxref + 8)}"`);

check('Die gewählte Funktion steht darauf', pdfText.includes('Crew'));
check('Und die gewählte Befähigung', pdfText.includes('SKS'));
check('Die Anmerkungen stehen darauf',
  pdfText.includes('ANMERKUNGEN') && pdfText.includes('Windst'));
check('Die eigenen Zeilenumbrüche bleiben erhalten',
  pdfText.includes('Nachtfahrt Kiel') && pdfText.includes('Windstärke 6 aus Südwest'));
check('Der Rechenweg steht nicht mehr darauf',
  !pdfText.includes('Motor an'));
check('Ohne Haken bleibt es bei einer Seite',
  /\/Count 1\b/.test(pdfText), pdfText.match(/\/Count \d+/)?.[0] ?? 'kein /Count');
await shot('06c-meilenbestaetigung');

// --- Ausführlicher Nachweis ------------------------------------------------
// Eine Zahl im Kasten sagt „147,3 sm“. Wer sie prüfen will, braucht die Spur,
// die Etappen darin und die Einträge, aus denen beides entstanden ist.
await page.locator('[data-miles="detail"]').check();
const [milesLang] = await Promise.all([
  page.waitForEvent('download'),
  page.locator('#miles-make').click(),
]);
const langText = readFileSync(await milesLang.path()).toString('latin1');
// Mit --shots das Blatt selbst ablegen: Ob eine Spur lesbar ist, sagt keine
// Zeichenkettenprüfung – das muss man ansehen.
if (SHOTS) await milesLang.saveAs(join(SHOT_DIR, '06d-meilen-ausfuehrlich.pdf'));
check('Mit Haken kommen weitere Seiten dazu',
  Number(langText.match(/\/Count (\d+)/)[1]) >= 2,
  langText.match(/\/Count \d+/)?.[0] ?? 'kein /Count');
check('Die Anlage nennt sich ausführlicher Nachweis',
  langText.includes('Ausführlicher Nachweis'));
check('Sie zeigt die gefahrene Route',
  langText.includes('GEFAHRENE ROUTE') && langText.includes('Anfang'));
check('Die Spur ist als Streckenzug darin',
  /\d+\.\d\d \d+\.\d\d m\n(?:\d+\.\d\d \d+\.\d\d l\n){5,}/.test(langText),
  'kein Streckenzug mit mindestens fünf Stützpunkten gefunden');
check('Der Maßstabsbalken steht dabei', /\(\d+,?\d* sm\)/.test(langText));
check('Die Etappen stehen darin', langText.includes('ETAPPEN'));
check('Und die Einträge mit Zeit und Position',
  langText.includes('EINTRÄGE') && langText.includes('Position'));
check('Die Anlage ist ebenfalls ein vollständiges PDF',
  langText.startsWith('%PDF-1.4') && langText.trimEnd().endsWith('%%EOF'));
const startxrefLang = Number(langText.match(/startxref\n(\d+)\n/)[1]);
check('Auch mit mehreren Seiten stimmt die Querverweistabelle',
  langText.slice(startxrefLang, startxrefLang + 4) === 'xref',
  `bei ${startxrefLang} steht "${langText.slice(startxrefLang, startxrefLang + 8)}"`);
await page.locator('[data-miles="detail"]').uncheck();

// --- Sicherung -------------------------------------------------------------
// Das Logbuch liegt im Speicher des Browsers, und den wirft iOS bei
// Platzmangel weg. Ohne Sicherung ist dann die Saison fort.
const [sicherung] = await Promise.all([
  page.waitForEvent('download'),
  page.getByRole('button', { name: /Sicherung ablegen/ }).click(),
]);
const sicherungPfad = await sicherung.path();
const vorLoeschen = await page.locator('.log-item').count();

page.once('dialog', (d) => d.accept());
// Nach dem Inhalt suchen, nicht nach der Überschrift: „Einträge“ steht auch
// als Beschriftung in den Messwerten über der Spur.
await page.locator('.card').filter({ has: page.locator('.log-item') })
  .getByRole('button', { name: 'Alle löschen' }).click();
await page.waitForTimeout(400);
check('Alles löschen leert das Logbuch', await page.locator('.log-item').count() === 0,
  `${await page.locator('.log-item').count()} übrig`);

await page.locator('#log-restore').setInputFiles(sicherungPfad);
await page.waitForTimeout(700);
check('Die Sicherung holt das Logbuch zurück',
  await page.locator('.log-item').count() === vorLoeschen,
  `${vorLoeschen} vorher, ${await page.locator('.log-item').count()} zurück`);
check('Auch der Törn ist wieder da',
  (await page.locator('.trip-name, .chip').allInnerTexts()).some((v) => v.includes('Ostsee 2026')));

// Ein zweites Zurücklesen darf nichts verdoppeln – sonst wächst das Logbuch
// bei jedem Wiederherstellen.
await page.locator('#log-restore').setInputFiles(sicherungPfad);
await page.waitForTimeout(700);
check('Zweimal zurücklesen verdoppelt nichts',
  await page.locator('.log-item').count() === vorLoeschen,
  `${await page.locator('.log-item').count()} Einträge`);

// Törn beenden – der Abschluss gehört genauso ins Logbuch wie der Anfang.
const antworten2 = ['Marstal'];
const aufDialog2 = (d) => d.accept(antworten2.shift() ?? '');
page.on('dialog', aufDialog2);
await page.getByRole('button', { name: /Törn beenden/ }).click();
await page.waitForTimeout(500);
page.off('dialog', aufDialog2);
check('Der Törn lässt sich beenden',
  await page.getByRole('button', { name: /Törn beginnen/ }).count() === 1);
check('Und das Anlegen steht im Logbuch',
  (await page.locator('.log-item').first().innerText()).includes('Anlegen'),
  (await page.locator('.log-item').first().innerText()).replace(/\n/g, ' | '));

// --- Notruf ins Logbuch ----------------------------------------------------
// Bewusst ein eigener Griff und nicht das Kopieren: Text in die
// Zwischenablage zu legen heißt nicht, ihn gesprochen zu haben.
await goTab(0);
await page.waitForTimeout(200);
await page.locator('.phrase-btn').first().click();
await page.waitForTimeout(300);
const notrufKnopf = page.getByRole('button', { name: /Abgesetzt – ins Logbuch/ });
check('Ein Notruf lässt sich als abgesetzt vermerken', await notrufKnopf.count() === 1);
await notrufKnopf.click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Zurück' }).first().click().catch(() => {});
await goTab(4);
await page.waitForTimeout(400);
check('Der abgesetzte Notruf steht im Logbuch',
  (await page.locator('.log-item').first().innerText()).includes('Notruf'),
  (await page.locator('.log-item').first().innerText()).replace(/\n/g, ' | '));

await goTab(3);

// --- Nachtmodus ------------------------------------------------------------
const nachtKnopf = page.getByRole('button', { name: 'Nachtmodus umschalten' });
const theme = () => page.locator('html').getAttribute('data-theme');

// Wer im hellen Schema unterwegs war, muss nach dem Nachtmodus wieder dort
// landen – und nicht im dunklen, ohne etwas geändert zu haben.
await page.evaluate(async () => {
  const { settings } = await import('./js/lib/storage.js');
  const { applyTheme } = await import('./js/lib/theme.js');
  settings.set('theme', 'light');
  applyTheme();
});
check('Ausgangspunkt ist das helle Schema', await theme() === 'light');
await nachtKnopf.click();
check('Von hell in den Nachtmodus', await theme() === 'night');
await nachtKnopf.click();
check('Und wieder zurück ins helle Schema', await theme() === 'light', await theme());

// Aus dem dunklen Schema heraus genauso.
await page.evaluate(async () => {
  const { settings } = await import('./js/lib/storage.js');
  const { applyTheme } = await import('./js/lib/theme.js');
  settings.set('theme', 'dark');
  applyTheme();
});
await nachtKnopf.click();
await nachtKnopf.click();
check('Aus dem dunklen Schema führt er ins dunkle zurück', await theme() === 'dark', await theme());

await nachtKnopf.click();
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

// Die Platzhalter trugen ihre Farbe vom Browser – ein neutrales Grau, und
// damit die einzige farblose, weißliche Stelle im ganzen Nachtmodus.
// Im Logbuch steht ein Eingabefeld mit Platzhalter – die Lichterliste hat
// keines.
await goTab(4);
await page.waitForSelector('input[placeholder]');
const platzhalterNacht = await page.evaluate(() => {
  const el = document.querySelector('input[placeholder]');
  if (!el) return null;
  const c = getComputedStyle(el, '::placeholder').color;
  return (c.match(/[\d.]+/g) ?? []).map(Number);
});
await goTab(3);
await page.waitForTimeout(300);
check('Auch die Platzhalter stehen im Nachtmodus in Rot',
  platzhalterNacht !== null, 'kein Eingabefeld mit Platzhalter gefunden');
if (platzhalterNacht) longWaveOnly(platzhalterNacht, 'Platzhalter');
// Zurück auf die Lichterliste: Dort zeigt sich, ob die Schemabilder im
// Nachtmodus gedämpft werden, statt mit Weiß und Grün zu blenden.
await page.evaluate(() => window.scrollTo(0, 0));
await page.getByRole('button', { name: 'Lichter', exact: true }).click();
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

// --- Einstellungen: Reiter „Karten“ ----------------------------------------
// Zurück auf ein helles Schema, damit die folgenden Prüfungen nicht am
// Nachtmodus hängen.
await goSettings();
await page.waitForSelector('.card');
await page.getByRole('button', { name: 'Karten', exact: true }).click();
await page.waitForTimeout(200);
check('Karten haben einen eigenen Reiter in den Einstellungen',
  (await page.locator('main').innerText()).includes('Seegebiet ins Gerät holen'));
check('Noch kein Seegebiet geladen',
  (await page.locator('main').innerText()).includes('Noch kein Seegebiet geladen'));

// Fertige Seegebiete: Antippen genügt, und die Menge steht sofort da.
check('Fertige Seegebiete stehen zur Auswahl',
  await page.locator('.region-row').count() > 10,
  `${await page.locator('.region-row').count()} Gebiete`);
check('Ohne Auswahl lässt sich nichts laden',
  await page.getByRole('button', { name: /Herunterladen/ }).isDisabled());
// Die eigene Position liegt in der Kieler Bucht – das Gebiet muss oben stehen.
const firstRegion = await page.locator('.region-row').first().innerText();
check('Das Gebiet unter dem Kiel steht oben', /Kieler Bucht/.test(firstRegion),
  firstRegion.replace(/\n/g, ' | '));
await page.locator('.region-row[data-region="kieler-bucht"]').first().click();
await page.waitForTimeout(150);
check('Gewähltes Gebiet lässt sich laden',
  !(await page.getByRole('button', { name: /Herunterladen/ }).isDisabled()));
const regionTiles = Number(
  (await page.locator('.readout .cell').first().innerText()).replace(/\D/g, ''));
check('Ein Revier passt in einen Rutsch', regionTiles > 0 && regionTiles <= 4000,
  `${regionTiles} Abrufe`);
await shot('07c-seegebiete');
await page.locator('.region-row[data-region="kieler-bucht"]').first().click();

await page.getByRole('button', { name: 'Umkreis', exact: true }).click();
await page.waitForTimeout(150);

// Umkreis: Die Menge muss vor dem Herunterladen dastehen, nicht danach.
const tilesShown = await page.locator('.readout .cell').first().innerText();
check('Kachelmenge wird vorher angezeigt', /\d/.test(tilesShown.replace(/\D/g, '')),
  tilesShown.replace(/\n/g, ' | '));

// Feinere Stufe heißt mehr Kacheln – sonst stimmt die Rechnung nicht.
const tileCount = async () => Number(
  (await page.locator('.readout .cell').first().innerText()).replace(/\D/g, ''));
const coarse = await tileCount();
await page.locator('.chip', { hasText: 'Hafen' }).click();
const fine = await tileCount();
check('Feinere Stufe braucht mehr Kacheln', fine > coarse, `${coarse} → ${fine}`);
check('Zu große Mengen werden abgelehnt',
  (await page.locator('main').innerText()).includes('zu viele Kacheln')
  || fine <= 4000, `${fine} Kacheln`);
await page.locator('.chip', { hasText: 'Übersicht' }).click();

// Route: Punkte in der Reihenfolge des Törns.
await page.getByRole('button', { name: 'Route', exact: true }).click();
await page.waitForTimeout(150);
check('Ohne Punkte lässt sich keine Route laden',
  await page.getByRole('button', { name: /Herunterladen/ }).isDisabled());
await page.getByRole('button', { name: '+ Meine Position' }).click();
await page.waitForTimeout(150);
check('Route nimmt Punkte auf', await page.locator('.wp-item').count() >= 1);
check('Mit Punkt lässt sich die Route laden',
  !(await page.getByRole('button', { name: /Herunterladen/ }).isDisabled()));
await shot('07b-karten-einstellungen');
await page.getByRole('button', { name: 'Allgemein', exact: true }).click();
await page.waitForTimeout(150);

// --- Fertiges Kartenpaket: die ganze Kette ---------------------------------
// Herunterladen, ablegen, die SQLite-Datei lesen, die Kachel zeigen. Der
// Spiegel von OpenSeaMap ist von hier aus nicht erreichbar, also läuft es
// gegen ein Paket derselben Bauart vom örtlichen Server.
await page.getByRole('button', { name: 'Karten', exact: true }).click();
await page.waitForTimeout(200);
check('Fertige Kartenpakete werden angeboten',
  (await page.locator('main').innerText()).includes('Fertige Kartenpakete'));

// Ein <summary> ist keine Schaltfläche – es wird über den Text angesprochen.
await page.locator('summary', { hasText: 'Eigene Adresse verwenden' }).click();
await page.waitForTimeout(150);
await page.locator('input[placeholder*=".mbtiles"]').fill(`${base}test.mbtiles`);
// Bewusst ein anderer Name als in der Datei: Gelten muss der aus der Datei.
await page.locator('input[placeholder="z. B. Ostsee"]').fill('Egal');
await page.locator('.foldout', { hasText: 'Eigene Adresse' })
  .getByRole('button', { name: /Holen/ }).click();

// Der Download läuft über einen Strom – kurz warten, bis er durch ist.
await page.waitForFunction(
  () => !document.querySelector('#pack-progress'),
  null, { timeout: 30000 },
).catch(() => {});
await page.waitForTimeout(500);

const packText = await page.locator('main').innerText();
check('Kartenpaket liegt im Gerät', /vollständig/.test(packText),
  packText.split('\n').filter((l) => /Prüfgebiet|vollständig|Nicht geklappt/.test(l)).join(' | '));
// Der Name steht in der Datei, nicht im Eingabefeld – und übersteht den
// Weg durch SQLite samt Umlaut.
check('Der Name kommt aus dem Paket selbst', packText.includes('Prüfgebiet Kiel'),
  packText.split('\n').filter((l) => /Egal|Prüfgebiet/.test(l)).join(' | '));
await shot('07d-kartenpaket');

// Und jetzt der eigentliche Beweis: Die Karte zeigt daraus Kacheln.
await goTab(2);
await page.waitForSelector('.chart');
await page.waitForFunction(
  () => document.querySelectorAll('.chart-tile').length > 0,
  null, { timeout: 15000 },
).catch(() => {});
const gezeigt = await page.locator('.chart-tile').count();
check('Karte zeigt Kacheln aus dem Paket', gezeigt > 0, `${gezeigt} Kacheln`);
check('Der Hinweis auf fehlendes Material ist weg',
  !(await page.locator('main').innerText()).includes('Kein Kartenmaterial'));

// Die Bilder müssen auch wirklich laden – eine kaputte Kachel wäre ein
// leerer Rahmen, und den sieht man auf einem Bildschirmfoto nicht.
const geladen = await page.locator('.chart-tile').first()
  .evaluate((img) => img.complete && img.naturalWidth > 0);
check('Die Kacheln sind lesbare Bilder', geladen);

// An dieser Stelle läuft die App noch im Nachtmodus. Eine helle Seekarte
// wäre dort das Schlimmste, was der Dunkeladaption passieren kann.
const kachelFilter = await page.locator('.chart-tile').first()
  .evaluate((el) => getComputedStyle(el).filter);
check('Nachtmodus dämpft auch das Kartenbild',
  /brightness\(0?\.[0-3]\d*\)/.test(kachelFilter), kachelFilter);
await shot('04c-karte-mit-paket');

// --- Kartenpaket aus dem Gerät ---------------------------------------------
// Der Weg, der immer geht. Über eine Adresse zu laden gelingt nur, wenn der
// Server einer fremden Seite das Lesen erlaubt – die Dateispiegel, auf denen
// die großen Pakete liegen, tun das nicht, und dann bricht der Griff mit
// „Load failed“ ab, noch bevor der Dateiname eine Rolle spielt. Ein Download
// im Browser selbst kennt diese Schranke nicht; von dort wird die Datei hier
// hereingereicht.
await goSettings();
await page.getByRole('button', { name: 'Karten', exact: true }).click();
await page.waitForTimeout(200);
check('Es gibt einen Weg über eine Datei aus dem Gerät',
  await page.locator('#pack-file').count() === 1);
check('Und er steht offen da, nicht in einer Klappe',
  await page.locator('#pack-file').isVisible());

// Der Verweis, der den Browser den Download machen lässt – das ist der Weg,
// an dem die Schranke nicht greift. Er muss auf die Datei selbst zeigen und
// sie nicht in der App öffnen.
const ostseeZeile = page.locator('.wp-item', { hasText: 'Ostsee' }).first();
const verweis = ostseeZeile.getByRole('link');
check('Jedes Paket hat einen Verweis zum Laden im Browser',
  await verweis.count() === 1);
check('Der Verweis zeigt auf die MBTiles-Datei',
  /Baltic_Sea\.mbtiles$/.test(await verweis.getAttribute('href')),
  await verweis.getAttribute('href'));
check('Und er öffnet sie außerhalb der App',
  await verweis.getAttribute('target') === '_blank');
check('Der unmittelbare Versuch steht daneben',
  await ostseeZeile.getByRole('button', { name: /Direkt/ }).count() === 1);

await page.locator('#pack-file').setInputFiles(FIXTURE);
await page.waitForFunction(
  () => !document.querySelector('#pack-progress'),
  null, { timeout: 30000 },
).catch(() => {});
await page.waitForTimeout(400);

const dateiText = await page.locator('main').innerText();
check('Die Datei liegt danach als Kartenpaket im Gerät',
  (dateiText.match(/vollständig/g) ?? []).length >= 2,
  dateiText.split('\n').filter((l) => /vollständig|Nicht geklappt|kein lesbares/.test(l)).join(' | '));

// Heißt die Datei wie ein Paket aus dem Katalog, wird sie auch dort
// einsortiert – sonst lädt man „Ostsee“ im Browser, wählt es hier aus, und
// oben steht weiter „noch nicht da“.
const alsOstsee = join(FIXTURE_DIR, 'Baltic_Sea.mbtiles');
writeFileSync(alsOstsee, readFileSync(FIXTURE));
await page.locator('#pack-file').setInputFiles(alsOstsee);
await page.waitForFunction(
  () => !document.querySelector('#pack-progress'),
  null, { timeout: 30000 },
).catch(() => {});
await page.waitForTimeout(400);
check('Eine Datei mit bekanntem Namen landet beim richtigen Paket',
  (await page.locator('main').innerText()).includes('✓ Ostsee'),
  (await page.locator('main').innerText()).split('\n')
    .filter((l) => /Ostsee/.test(l)).join(' | '));

// Und was keine Karte ist, wird als solches erkannt, statt Platz zu belegen.
const müll = join(FIXTURE_DIR, 'kaputt.mbtiles');
writeFileSync(müll, Buffer.from('Das ist keine Datenbank, sondern Text.'));
await page.locator('#pack-file').setInputFiles(müll);
await page.waitForTimeout(1200);
check('Eine Datei, die kein Kartenpaket ist, wird abgewiesen',
  (await page.locator('main').innerText()).includes('kein lesbares Kartenpaket'),
  (await page.locator('main').innerText()).split('\n')
    .filter((l) => /kein lesbares|ließ sich nicht/.test(l)).join(' | '));

// Eine unerreichbare Adresse muss nicht nur scheitern, sondern auch sagen,
// was stattdessen zu tun ist – und die Meldung muss stehen bleiben.
await page.locator('summary', { hasText: 'Eigene Adresse verwenden' }).click();
await page.waitForTimeout(150);
await page.locator('input[placeholder*=".mbtiles"]').fill(`${base}gibtesnicht.mbtiles`);
await page.locator('.foldout', { hasText: 'Eigene Adresse' })
  .getByRole('button', { name: /Holen/ }).click();
await page.waitForTimeout(1500);
const fehlText = await page.locator('main').innerText();
check('Ein Fehlschlag bleibt sichtbar stehen', /ließ sich nicht holen/.test(fehlText),
  fehlText.split('\n').filter((l) => /ließ sich nicht|antwortet mit/.test(l)).join(' | '));
check('Und nennt den Weg über die Datei', /Datei aus dem Gerät/.test(fehlText));
await shot('07e-kartenpaket-datei');

// --- Fortsetzen eines abgerissenen Downloads -------------------------------
// Das ist der Fall, der auf einem Boot wirklich eintritt. Geprüft wird
// unmittelbar an der Bibliothek: ein angefangenes Stück ablegen, den Download
// anstoßen und sehen, ob am Ende eine vollständige, lesbare Datei dasteht.
// Würde der Bereich falsch angehängt, wäre die Datei verdorben und ließe sich
// nicht mehr als Kartenpaket öffnen – der Fehler käme also sicher heraus.
const fortgesetzt = await page.evaluate(async (url) => {
  const { downloadPack, removePack } = await import('./js/lib/packs.js');
  const dir = await navigator.storage.getDirectory();
  const ganz = new Uint8Array(await (await fetch(url)).arrayBuffer());

  const teil = await dir.getFileHandle('probe.mbtiles.teil', { create: true });
  const schreiber = await teil.createWritable();
  await schreiber.write(ganz.subarray(0, Math.floor(ganz.length / 3)));
  await schreiber.close();
  const vorher = (await teil.getFile()).size;

  try {
    const res = await downloadPack({
      id: 'probe', name: 'Fortsetzen', url, expectedBytes: ganz.length,
    });
    return { vorher, nachher: res.bytes, ganz: ganz.length, fehler: null };
  } catch (err) {
    return { vorher, nachher: 0, ganz: ganz.length, fehler: err.message };
  } finally {
    await removePack('probe').catch(() => {});
  }
}, `${base}test.mbtiles`);

check('Abgerissener Download wird fortgesetzt',
  fortgesetzt.fehler === null && fortgesetzt.nachher === fortgesetzt.ganz,
  `angefangen ${fortgesetzt.vorher}, danach ${fortgesetzt.nachher} von ${fortgesetzt.ganz}`
  + (fortgesetzt.fehler ? ` – ${fortgesetzt.fehler}` : ''));
check('Es wurde wirklich nur der Rest geholt',
  fortgesetzt.vorher > 0 && fortgesetzt.vorher < fortgesetzt.ganz,
  `${fortgesetzt.vorher} von ${fortgesetzt.ganz} lagen schon da`);

// Und die Oberfläche muss das Fortsetzen auch anbieten – gerade bei einem
// selbst eingetragenen Paket, denn das wird genommen, wenn eine der
// vorgegebenen Adressen nicht stimmt.
await page.evaluate(async (url) => {
  const dir = await navigator.storage.getDirectory();
  const ganz = new Uint8Array(await (await fetch(url)).arrayBuffer());
  const teil = await dir.getFileHandle('halb.mbtiles.teil', { create: true });
  const schreiber = await teil.createWritable();
  await schreiber.write(ganz.subarray(0, Math.floor(ganz.length / 4)));
  await schreiber.close();
  const reg = JSON.parse(localStorage.getItem('sailing-buddy-packs') ?? '{}');
  reg.halb = { name: 'Halbes Paket', url, ts: Date.now(), total: ganz.length };
  localStorage.setItem('sailing-buddy-packs', JSON.stringify(reg));
}, `${base}test.mbtiles`);

await goSettings();
await page.getByRole('button', { name: 'Karten', exact: true }).click();
await page.waitForTimeout(400);
const halbeZeile = page.locator('.wp-item', { hasText: 'Halbes Paket' });
check('Angefangenes Paket wird als solches gezeigt',
  (await halbeZeile.innerText()).includes('angefangen'),
  (await halbeZeile.innerText().catch(() => '—')).replace(/\n/g, ' | '));
check('Angefangenes Paket lässt sich fortsetzen',
  await halbeZeile.getByRole('button', { name: /Fortsetzen/ }).count() === 1);

await halbeZeile.getByRole('button', { name: /Fortsetzen/ }).click();
await page.waitForFunction(() => !document.querySelector('#pack-progress'),
  null, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(400);
check('Fortsetzen über die Oberfläche macht es vollständig',
  (await page.locator('.wp-item', { hasText: 'Prüfgebiet Kiel' }).count()) >= 1,
  (await page.locator('main').innerText()).split('\n')
    .filter((l) => /Halbes|Prüfgebiet|vollständig|angefangen/.test(l)).join(' | '));

// Aufräumen: Das Paket trägt jetzt den Namen aus der Datei.
page.once('dialog', (d) => d.accept());
await page.locator('.wp-item', { hasText: 'Prüfgebiet Kiel' })
  .getByRole('button', { name: '✕' }).first().click();
await page.waitForTimeout(600);

// Wieder weg damit, damit die folgenden Prüfungen nichts erben.
await goSettings();
await page.getByRole('button', { name: 'Karten', exact: true }).click();
await page.waitForTimeout(200);
page.once('dialog', (d) => d.accept());
await page.locator('.wp-item', { hasText: 'Prüfgebiet Kiel' })
  .getByRole('button', { name: '✕' }).first().click();
await page.waitForTimeout(600);
check('Kartenpaket wieder löschbar',
  !(await page.locator('main').innerText()).includes('Prüfgebiet Kiel'));
await page.getByRole('button', { name: 'Allgemein', exact: true }).click();
await page.waitForTimeout(150);

// --- Mehr: was gerade nicht unten steht ------------------------------------
// Welche fünf Bereiche unten stehen, entscheidet die Benutzung. Damit die
// folgenden Prüfungen etwas Festes vor sich haben, wird die Reihenfolge hier
// erst einmal bewusst gesetzt: zuletzt benutzt sind danach die fünf
// Bordbereiche, hinter „Mehr“ liegen Knoten und Einstellungen.
for (const k of ['knoten', 'setup', 'funk', 'position', 'karte', 'nacht', 'logbuch']) {
  await goTab(k);
  await page.waitForTimeout(120);
}

await goTab('mehr');
await page.waitForSelector('.more-item');
check('Der letzte Reiter heißt Mehr',
  (await page.locator('nav.tabs button').nth(5).innerText()).includes('Mehr'),
  await page.locator('nav.tabs button').nth(5).innerText());
check('Dahinter liegt eine Liste der übrigen Module',
  await page.locator('.more-item').count() >= 2,
  `${await page.locator('.more-item').count()} Einträge`);
check('Die Einstellungen sind einer davon',
  await page.locator('[data-mod="setup"]').count() === 1);
const untenVorher = await barKeys();
const dahinterVorher = await moreKeys();
check('Was unten steht, liegt nicht doppelt dahinter',
  dahinterVorher.every((k) => !untenVorher.includes(k)),
  `unten ${untenVorher.join(', ')} – dahinter ${dahinterVorher.join(', ')}`);
check('Zusammen sind es alle Bereiche',
  untenVorher.length === 5 && untenVorher.length + dahinterVorher.length === 7,
  `${untenVorher.length} unten, ${dahinterVorher.length} dahinter`);
check('Und die Zeilen sind groß genug zum Treffen',
  await page.locator('.more-item').first()
    .evaluate((el) => Math.round(el.getBoundingClientRect().height)) >= 60,
  `${await page.locator('.more-item').first().evaluate((el) => Math.round(el.getBoundingClientRect().height))} px`);
await shot('08a-mehr');

// --- Knoten ----------------------------------------------------------------
await page.locator('[data-mod="knoten"]').click();
await page.waitForSelector('.knot-card');
check('Aus „Mehr“ heraus wird der Bereich aufgeschlagen, nicht eingebettet',
  await page.locator('nav.tabs button[data-tab="knoten"][aria-current="page"]').count() === 1,
  (await page.locator('nav.tabs').innerText()).replace(/\n/g, ' | '));
const knotenAlle = await page.locator('.knot-card').count();
check('Die Knoten sind da', knotenAlle >= 12, `${knotenAlle} Knoten`);
check('Der Palstek ist dabei',
  (await page.locator('main').innerText()).includes('Palstek'));
check('Bei jedem steht, wie er gelegt wird',
  await page.locator('.knot-card ol.checklist').count() === knotenAlle);
check('Und was er hält',
  (await page.locator('main').innerText()).includes('Was er hält'));

// Gesucht wird nach dem Zweck, nicht nach dem Namen – den weiß man ja nicht.
await page.locator('[data-filter="use"]').getByRole('button', { name: 'Ein Auge legen' }).click();
await page.waitForTimeout(300);
const augen = await page.locator('.knot-card').count();
check('Der Filter fragt nach dem Zweck', augen > 0 && augen < knotenAlle,
  `${augen} von ${knotenAlle}`);
check('„Ein Auge legen“ führt zum Palstek',
  (await page.locator('.knot-card').first().innerText()).includes('Palstek'),
  (await page.locator('.knot-card').first().innerText()).split('\n')[0]);

await page.locator('[data-filter="use"]').getByRole('button', { name: 'Festmachen' }).click();
await page.waitForTimeout(300);
check('Mehrere Zwecke erweitern die Auswahl',
  await page.locator('.knot-card').count() > augen,
  `${await page.locator('.knot-card').count()} statt ${augen}`);

await page.locator('[data-filter="trait"]').getByRole('button', { name: 'Auf Slip zu lösen' }).click();
await page.waitForTimeout(300);
check('Eine Eigenschaft grenzt zusätzlich ein',
  await page.locator('.knot-card').count() < augen + 6,
  `${await page.locator('.knot-card').count()} übrig`);

await page.getByRole('button', { name: /Filter zurücksetzen|zurücksetzen/ }).first().click();
await page.waitForTimeout(300);
check('Zurücksetzen zeigt wieder alle',
  await page.locator('.knot-card').count() === knotenAlle);

// Die Zeichnung: Wo eine ist, wächst sie Schritt für Schritt mit. Wo keine
// ist, steht auch kein leerer Kasten – der wäre schlechter als keiner.
const palstekKarte = page.locator('.knot-card', { hasText: 'Palstek' }).first();
check('Der Palstek hat eine Zeichnung',
  await palstekKarte.locator('.knot-fig').count() === 1);
check('Und darunter die Schritte zum Antippen',
  await palstekKarte.locator('.knot-steps button').count() === 4,
  `${await palstekKarte.locator('.knot-steps button').count()} Schritte`);

// Sie läuft von selbst: „am liebsten bewegte“ heißt genau das.
const teileBei = async (n) => {
  await page.locator('[data-knotsteps="palstek"] button').nth(n - 1).click();
  await page.waitForTimeout(200);
  return page.locator('[data-knot="palstek"] .knot-core').count();
};
const teile1 = await teileBei(1);
const teile4 = await teileBei(4);
check('Bei Schritt eins liegt erst ein Part da', teile1 === 1, `${teile1} Parte`);
check('Bei Schritt vier der ganze Knoten', teile4 === 8, `${teile4} Parte`);
check('Der gewählte Schritt steht angetippt da',
  await page.locator('[data-knotsteps="palstek"] button[aria-pressed="true"]').innerText() === '4');

// Jeder Part wird zweimal gezeichnet: einmal als Rand in der Farbe des
// Grundes, einmal als Kern. Ohne den Rand sähe man an keiner Kreuzung, welcher
// Part über welchem liegt – und genau daran erkennt man einen Knoten.
check('Jeder Part hat seinen Rand',
  await page.locator('[data-knot="palstek"] .knot-casing').count()
  === await page.locator('[data-knot="palstek"] .knot-core').count());

// Ein Tipp auf das Bild hält an und lässt wieder laufen.
await page.locator('[data-knot="palstek"]').click();
await page.waitForTimeout(1800);
const nachHalt = await page.locator('[data-knotsteps="palstek"] button[aria-pressed="true"]').innerText();
check('Ein Tipp auf das Bild lässt es weiterlaufen', nachHalt !== '4', `steht bei ${nachHalt}`);

check('Knoten ohne Zeichnung bekommen keinen leeren Kasten',
  await page.locator('.knot-card').count() > await page.locator('.knot-fig').count(),
  `${await page.locator('.knot-fig').count()} von ${await page.locator('.knot-card').count()} gezeichnet`);
await shot('08b-knoten');

// Was man aufruft, rückt in die Leiste nach – und der am längsten nicht
// benutzte Bereich weicht dafür nach hinten.
check('Der aufgerufene Bereich steht danach unten in der Leiste',
  await page.locator('nav.tabs button[data-tab="knoten"]').count() === 1,
  (await page.locator('nav.tabs').innerText()).replace(/\n/g, ' | '));
check('Die Leiste hat weiterhin sechs Felder',
  await page.locator('nav.tabs button').count() === 6,
  `${await page.locator('nav.tabs button').count()} Felder`);
check('„Mehr“ bleibt das letzte davon',
  await page.locator('nav.tabs button').last().getAttribute('data-tab') === 'mehr');
const untenNachher = await barKeys();
const verdraengt = untenVorher.filter((k) => !untenNachher.includes(k));
check('Und dafür weicht genau einer – der am längsten nicht benutzte',
  verdraengt.length === 1 && verdraengt[0] === 'funk',
  `gewichen: ${verdraengt.join(', ') || '–'} | jetzt unten: ${untenNachher.join(', ')}`);

// Aufgerufen heißt aufgeschlagen: Der Bereich steht jetzt als eigener Reiter
// da, nicht zwei Ebenen tief hinter einem Zurück-Knopf. Der Weg zurück zur
// Übersicht ist derselbe wie der hin – „Mehr“ unten.
await goTab('mehr');
await page.waitForSelector('.more-item');
check('Und zurück zur Übersicht',
  await page.locator('.more-item').count() >= 1);
check('Der Verdrängte liegt nun hinter „Mehr“',
  (await moreKeys()).includes('funk'), (await moreKeys()).join(', '));
check('Was schon unten steht, liegt nicht doppelt dahinter',
  await page.locator('[data-mod="knoten"]').count() === 0);

// --- Oberflächensprache ----------------------------------------------------
await goSettings();
await page.waitForSelector('.card');
await page.getByRole('button', { name: 'English' }).first().click();
await page.waitForTimeout(150);
const tabsText = await page.locator('nav.tabs').innerText();
check('Reiter auf Englisch',
  tabsText.includes('Settings') && tabsText.includes('More') && !tabsText.includes('Einstellungen'),
  tabsText);
check('Titel auf Englisch', (await page.locator('.topbar h1').innerText()).includes('Settings'),
  await page.locator('.topbar h1').innerText());
await goTab('mehr');
await page.waitForSelector('.more-item');
check('Auch die Liste hinter „Mehr“ ist übersetzt',
  (await page.locator('main').innerText()).includes('moves down'),
  (await page.locator('main').innerText()).split('\n')[0]);
await goSettings();
await page.waitForSelector('.card');
await shot('07-settings-en');

// Funkspruchsprache blieb davon unberührt (steht noch auf Deutsch).
await goTab(0);
await page.waitForSelector('.phrase-btn');
// Die Trennlinie verläuft zwischen Sprechen und Lesen: Der Sprechtext steht
// in der Sprache der Funksprüche (hier weiter Deutsch), Name, Beschreibung
// und Ablauf in der der Oberfläche (jetzt Englisch). Wer die Menüs auf
// Englisch führt, sucht auch die Beschreibung auf Englisch – auch dann, wenn
// er gleich Deutsch sprechen wird.
const firstPhrase = await page.locator('.phrase-btn').first().innerText();
check('Die Beschreibung folgt der Oberflächensprache',
  firstPhrase.includes('distress call'), firstPhrase.replace(/\n/g, ' | '));
await page.locator('.phrase-btn').first().click();
await page.waitForSelector('.script');
check('Der Sprechtext bleibt in der Sprache der Funksprüche',
  (await page.locator('.script').innerText()).includes('HIER IST'),
  (await page.locator('.script').innerText()).split('\n').slice(0, 3).join(' | '));
check('Und der Ablauf daneben ist in der Oberflächensprache',
  (await page.locator('main').innerText()).includes('Notes and procedure'),
  (await page.locator('main').innerText()).split('\n')
    .filter((l) => /Notes and procedure|Hinweise und Ablauf/.test(l)).join(' | '));
await page.getByRole('button', { name: 'Back' }).first().click();
await page.waitForTimeout(200);
// Kein Zurückschalten nötig: Die Funkspruchsprache steht noch auf Deutsch,
// und der Umschalter dafür sitzt inzwischen in der Kopfzeile.

// --- Nachtmodus nach der Sonne ---------------------------------------------
// Eine feste Uhrzeit taugt dafür nicht: Im Juni ist es an der Ostsee um
// 22 Uhr noch hell, im Dezember um 17 Uhr längst dunkel. Geprüft wird gegen
// die gerechnete Zeit am eigenen Ort, nicht gegen die Uhr.
const sonne = await page.evaluate(async () => {
  const { sunTimes, isDark } = await import('./js/lib/sun.js');
  const heute = new Date();
  const { sunset, sunrise } = sunTimes(heute, 54.5, 10.27);
  return {
    untergang: sunset.toISOString(),
    aufgang: sunrise.toISOString(),
    kurzDanach: isDark(new Date(sunset.getTime() + 10 * 60000), 54.5, 10.27),
    spaeter: isDark(new Date(sunset.getTime() + 61 * 60000), 54.5, 10.27),
    vorAufgang: isDark(new Date(sunrise.getTime() - 30 * 60000), 54.5, 10.27),
  };
});
check('Die Sonnenzeiten werden ohne Verbindung gerechnet',
  /^\d{4}-/.test(sonne.untergang), JSON.stringify(sonne));
check('Zehn Minuten nach Sonnenuntergang ist es noch nicht dunkel',
  sonne.kurzDanach === false);
check('Eine Stunde danach schon', sonne.spaeter === true);
check('Und vor dem Sonnenaufgang ebenfalls', sonne.vorAufgang === true);

// Der Schalter dafür steht in den Einstellungen und lässt sich abschalten.
await goSettings();
await page.waitForSelector('.card');
// Die Oberfläche steht an dieser Stelle auf Englisch.
check('Der automatische Nachtmodus lässt sich einstellen',
  (await page.locator('main').innerText()).includes('Night mode by the sun'),
  (await page.locator('main').innerText()).split('\n').filter((l) => /sun|Sonne/.test(l)).join(' | '));
check('Und nennt den heutigen Sonnenuntergang',
  /Sunset today at \d/.test(await page.locator('main').innerText()),
  (await page.locator('main').innerText()).split('\n').filter((l) => /Sunset/.test(l)).join(' | '));

// Voreingestellt an – und was von Hand gesetzt wurde, wirft er nicht um.
check('Voreingestellt ist er an',
  await page.evaluate(() => JSON.parse(localStorage.getItem('sailing-buddy')).autoNight) !== false);
// Die Zeit wird dabei vorgegeben, damit die Prüfung nicht davon abhängt,
// wann sie läuft – gerechnet wird trotzdem mit derselben Rechnung wie im
// Betrieb.
const umgestellt = await page.evaluate(async () => {
  const { settings } = await import('./js/lib/storage.js');
  const { applyAutoNight, applyTheme } = await import('./js/lib/theme.js');
  const { sunTimes } = await import('./js/lib/sun.js');
  const hier = { lat: 54.5, lon: 10.27 };
  const { sunset, sunrise } = sunTimes(new Date(), hier.lat, hier.lon);

  settings.update({ theme: 'light', nightAuto: false, autoNight: true });
  applyTheme();
  const vorher = document.documentElement.getAttribute('data-theme');

  // Zehn Minuten nach Sonnenuntergang: noch zu hell für Rot auf Schwarz.
  applyAutoNight(hier, new Date(sunset.getTime() + 10 * 60000));
  const kurzDanach = document.documentElement.getAttribute('data-theme');

  // Zwei Stunden danach: dunkel.
  applyAutoNight(hier, new Date(sunset.getTime() + 120 * 60000));
  const nachts = document.documentElement.getAttribute('data-theme');

  // Am nächsten Mittag wieder zurück – und zwar dorthin, wo es vorher stand.
  applyAutoNight(hier, new Date(sunrise.getTime() + 240 * 60000));
  const tags = document.documentElement.getAttribute('data-theme');

  // Von Hand gesetzt: Das wirft die Sonne nicht um.
  settings.update({ theme: 'night', nightAuto: false });
  applyTheme();
  applyAutoNight(hier, new Date(sunrise.getTime() + 240 * 60000));
  const vonHand = document.documentElement.getAttribute('data-theme');

  return { vorher, kurzDanach, nachts, tags, vonHand };
});
check('Kurz nach Sonnenuntergang bleibt es noch hell',
  umgestellt.kurzDanach === 'light', JSON.stringify(umgestellt));
check('Bei Dunkelheit schaltet er von selbst in den Nachtmodus',
  umgestellt.nachts === 'night', JSON.stringify(umgestellt));
check('Bei Tag geht es dorthin zurück, wo es vorher stand',
  umgestellt.tags === 'light', JSON.stringify(umgestellt));
check('Von Hand gesetzter Nachtmodus bleibt unangetastet',
  umgestellt.vonHand === 'night', JSON.stringify(umgestellt));

await page.evaluate(async () => {
  const { settings } = await import('./js/lib/storage.js');
  const { applyTheme } = await import('./js/lib/theme.js');
  settings.update({ theme: 'night', nightAuto: false });
  applyTheme();
});

// --- Helligkeit ------------------------------------------------------------
await goSettings();
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
await goSettings();
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
await coldPage.locator('.phrase-btn').first().click();
check('Funkspruch offline vollständig',
  (await coldPage.locator('.script').innerText()).includes('MAYDAY SEEBÄR'));
await goTabOn(coldPage, 'nacht');
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
