/**
 * Knotenzeichnungen ansehen.
 *
 * Eine Knotenzeichnung lässt sich nicht durch Nachdenken prüfen – man muss
 * sie ansehen. Dieses Werkzeug rendert sie und legt ein Bild ab.
 *
 *   node tools/knotshot.mjs                  alle, fertiger Zustand
 *   node tools/knotshot.mjs palstek --steps  ein Knoten, alle Schritte
 */

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
};

const server = createServer(async (req, res) => {
  const pfad = decodeURIComponent(req.url.split('?')[0]);
  try {
    const buf = await readFile(join(ROOT, pfad === '/' ? '/tools/knotlab.html' : pfad));
    res.writeHead(200, { 'content-type': TYPES[extname(pfad)] ?? 'application/octet-stream' });
    res.end(buf);
  } catch {
    res.writeHead(404);
    res.end('nicht da');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));

const args = process.argv.slice(2);
const knoten = args.filter((a) => !a.startsWith('--'));
const flags = args.filter((a) => a.startsWith('--')).map((a) => a.slice(2));
const query = [
  knoten.length ? `k=${knoten.join(',')}` : '',
  ...flags.map((f) => f),
].filter(Boolean).join('&');

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
});
const page = await browser.newPage({ viewport: { width: 1240, height: 900 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.error('Fehler:', e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/tools/knotlab.html?${query}`,
  { waitUntil: 'networkidle' });
await page.waitForTimeout(300);

const ziel = process.env.KNOT_SHOT ?? join(ROOT, 'knotlab.png');
await page.screenshot({ path: ziel, fullPage: true });
console.log(ziel);

await browser.close();
server.close();
