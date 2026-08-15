/**
 * Knotenzeichnungen nachrechnen, statt sie anzustarren.
 *
 * Zwei Fehler haben mich beim Zeichnen wieder und wieder aufgehalten, und
 * beide sieht man im fertigen Bild erst, wenn es zu spät ist:
 *
 *   1. Abschnitte, die nicht aneinanderstoßen. Ein Abschnitt endet bei (56,58),
 *      der nächste beginnt bei (56,58) – aber einer von beiden ist gar nicht
 *      gemeint gewesen, und die Leine reißt sichtbar auseinander.
 *
 *   2. Kreuzungen, die keine sind. Ich lege Stützpunkte hin in der Annahme,
 *      dass sich zwei Parte schneiden. Mal tun sie es, mal laufen sie knapp
 *      aneinander vorbei – und dann ist der Knoten keiner, sondern eine Schnur,
 *      die zufällig gekringelt daliegt.
 *
 * Beides lässt sich ausrechnen. Dieses Werkzeug tut genau das: Es rechnet die
 * Kurven aus, sucht die tatsächlichen Schnittpunkte und die losen Enden und
 * schreibt sie hin. Damit steht der Fehler in Zahlen da, statt dass man ihn
 * im Bild suchen muss.
 *
 *   node tools/knotcheck.mjs            alle
 *   node tools/knotcheck.mjs palstek    einer
 */

import { KNOT_DRAWINGS } from '../js/data/knotpaths.js';

/** Eine Kurve in Punkte auflösen – dieselbe Rundung wie beim Zeichnen. */
function sample(points, proSegment = 24) {
  const p = points.map(([x, y]) => ({ x, y }));
  if (p.length < 2) return p;
  const at = (i) => p[Math.max(0, Math.min(p.length - 1, i))];
  const out = [];
  for (let i = 0; i < p.length - 1; i += 1) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const k = 1 / 6;
    const c1 = { x: p1.x + (p2.x - p0.x) * k, y: p1.y + (p2.y - p0.y) * k };
    const c2 = { x: p2.x - (p3.x - p1.x) * k, y: p2.y - (p3.y - p1.y) * k };
    for (let s = 0; s < proSegment; s += 1) {
      const u = s / proSegment;
      const m = 1 - u;
      out.push({
        x: m * m * m * p1.x + 3 * m * m * u * c1.x + 3 * m * u * u * c2.x + u * u * u * p2.x,
        y: m * m * m * p1.y + 3 * m * m * u * c1.y + 3 * m * u * u * c2.y + u * u * u * p2.y,
      });
    }
  }
  out.push(p[p.length - 1]);
  return out;
}

/** Schneiden sich zwei Strecken? Gibt den Punkt zurück oder null. */
function cut(a, b, c, d) {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const nenner = r.x * s.y - r.y * s.x;
  if (Math.abs(nenner) < 1e-9) return null;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / nenner;
  const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / nenner;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a.x + t * r.x, y: a.y + t * r.y };
}

/** Alle Schnittpunkte zwischen zwei Punktzügen, grob zusammengefasst. */
function crossings(A, B) {
  const treffer = [];
  for (let i = 0; i < A.length - 1; i += 1) {
    for (let j = 0; j < B.length - 1; j += 1) {
      const q = cut(A[i], A[i + 1], B[j], B[j + 1]);
      if (!q) continue;
      // Nahe beieinanderliegende Treffer sind dieselbe Kreuzung.
      if (treffer.some((p) => Math.hypot(p.x - q.x, p.y - q.y) < 4)) continue;
      treffer.push(q);
    }
  }
  return treffer;
}

const nah = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < 1.5;
const drin = (p) => p.x > -2 && p.x < 102 && p.y > -2 && p.y < 102;
const rund = (n) => Math.round(n * 10) / 10;

const nur = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const ids = nur.length ? nur : Object.keys(KNOT_DRAWINGS);
let mangel = 0;

for (const id of ids) {
  const d = KNOT_DRAWINGS[id];
  if (!d) { console.log(`${id}: nicht da`); continue; }

  const bahnen = (d.strands ?? []).map((s) => ({ s, pts: sample(s.p) }));
  console.log(`\n── ${id} · ${bahnen.length} Abschnitte, ${d.steps ?? 1} Schritt(e)`);

  // --- Kreuzungen ---------------------------------------------------------
  let anzahl = 0;
  for (let i = 0; i < bahnen.length; i += 1) {
    for (let j = i + 1; j < bahnen.length; j += 1) {
      // Eine Berührung ist nur dann eine Naht und keine Kreuzung, wenn
      // *beide* Abschnitte dort enden – dann geht die Leine schlicht weiter.
      // Endet nur einer dort, läuft der andere hindurch, und das ist genau
      // die Kreuzung, auf die es ankommt.
      const endetDa = ({ pts }, q) => nah(q, pts[0]) || nah(q, pts[pts.length - 1]);
      const treffer = crossings(bahnen[i].pts, bahnen[j].pts)
        .filter((q) => !(endetDa(bahnen[i], q) && endetDa(bahnen[j], q)));
      if (!treffer.length) continue;
      anzahl += treffer.length;
      const wer = bahnen[j].s.hinter ? 'hinter' : `über ${i}`;
      console.log(`   Kreuzung ${i}×${j} (${j} liegt ${wer}): `
        + treffer.map((q) => `${rund(q.x)},${rund(q.y)}`).join('  '));
    }
  }
  if (anzahl === 0) {
    mangel += 1;
    console.log('   ⚠ keine einzige Kreuzung – das ist kein Knoten, sondern eine Schnur');
  }

  // --- Lose Enden ---------------------------------------------------------
  // Jedes Ende muss irgendwo hinführen: an ein anderes Ende, an ein loses Ende
  // der Leine oder aus dem Bild heraus. Alles andere ist ein Riss.
  bahnen.forEach(({ s, pts }, i) => {
    [['Anfang', pts[0]], ['Ende', pts[pts.length - 1]]].forEach(([wo, p]) => {
      if (!drin(p)) return;
      if (wo === 'Ende' && s.end === 'werk') return;
      const trifft = bahnen.some((b, j) => j !== i
        && (nah(p, b.pts[0]) || nah(p, b.pts[b.pts.length - 1])));
      if (trifft) return;
      mangel += 1;
      console.log(`   ⚠ Abschnitt ${i}: ${wo} bei ${rund(p.x)},${rund(p.y)} `
        + 'hängt in der Luft – die Leine reißt dort');
    });
  });
}

console.log(mangel ? `\n${mangel} Beanstandung(en)` : '\nnichts zu beanstanden');
process.exit(mangel ? 1 : 0);
