/**
 * Knotenzeichnungen nachrechnen, statt sie anzustarren.
 *
 * Eine Knotenzeichnung ist eine Behauptung: Hier läuft dieser Part über jenen.
 * Ob die Behauptung stimmt, sieht man im fertigen Bild erst, wenn man es
 * gerendert hat – und dann sieht man meistens nur, *dass* etwas nicht stimmt,
 * nicht *was*. Dieses Werkzeug rechnet es aus und schreibt es hin.
 *
 * Geprüft wird das, woran die ersten Anläufe gescheitert sind, und zwar in
 * dieser Reihenfolge, weil jeder Punkt den nächsten überhaupt erst sinnvoll
 * macht:
 *
 *   1. Gibt es Kreuzungen? Ohne Kreuzung ist das kein Knoten, sondern eine
 *      Schnur, die zufällig gekringelt daliegt.
 *
 *   2. Ist an jeder Kreuzung genau ein Part aufgetrennt? Keiner heißt: Man
 *      sieht nicht, welcher oben liegt. Beide heißt: Da klafft ein Loch.
 *
 *   3. Hat jede Auftrennung eine Kreuzung? Eine Lücke ohne Grund ist im Bild
 *      nichts anderes als eine gerissene Leine. Genau das ist beim ersten
 *      Modell reihenweise passiert, und keine Prüfung hat es gemeldet.
 *
 *   4. Liegen die Kreuzungen weit genug auseinander und treffen sie sich steil
 *      genug? Vier Kreuzungen auf einem Fleck sind ein Knäuel, auch wenn die
 *      Zählung stimmt; zwei Parte unter zwanzig Grad laufen nebeneinanderher,
 *      statt sich zu kreuzen.
 *
 *   5. Endet die Leine irgendwo mitten im Bild, ohne dass dort ein loses Ende
 *      gemeint war?
 *
 *   node tools/knotcheck.mjs            alle
 *   node tools/knotcheck.mjs palstek    einer
 */

import { KNOT_DRAWINGS } from '../js/data/knotpaths.js';
import {
  sample, laengen, crossings, stuecke, zuIndex, zuStelle, LUECKE,
} from '../js/lib/knotgeom.js';

/** Ab wann Kreuzungen ein Knäuel sind und ab wann sie keine mehr sind. */
const ABSTAND_MIN = 9;
const WINKEL_MIN = 25;
const STUECK_MIN = 8;

const drin = (p) => p.x > 1 && p.x < 99 && p.y > 1 && p.y < 99;
const rund = (n) => Math.round(n * 10) / 10;

const nur = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const ids = nur.length ? nur : Object.keys(KNOT_DRAWINGS);
let mangel = 0;
const meckern = (text) => { mangel += 1; console.log(`   ⚠ ${text}`); };

for (const id of ids) {
  const d = KNOT_DRAWINGS[id];
  if (!d) { console.log(`${id}: nicht da`); continue; }

  const linien = (d.lines ?? []).map((linie) => {
    const pts = sample(linie.p, linie.spannung ?? 1);
    return { linie, pts, l: laengen(pts) };
  });
  console.log(`\n── ${id} · ${linien.length} Leine(n), `
    + `${linien.reduce((s, x) => s + (x.linie.unter ?? []).length, 0)} Unterführung(en)`);

  /** Läuft die Leine an dieser Stelle gerade unter etwas hindurch? */
  const untenAn = (nr, index) => (linien[nr].linie.unter ?? []).some((stelle) => {
    const mitte = zuIndex(stelle);
    const l = linien[nr].l;
    const a = Math.max(0, Math.min(l.length - 1, Math.round(index)));
    return Math.abs(l[a] - l[Math.max(0, Math.min(l.length - 1, mitte))]) < LUECKE;
  });

  /** Liegt die Stelle hinter einem Requisit? Dann sieht man die Kreuzung nicht. */
  const versteckt = (nr, index) => (linien[nr].linie.hinter ?? [])
    .some(([a, b]) => index > zuIndex(a) && index < zuIndex(b));

  // --- Kreuzungen sammeln --------------------------------------------------
  const alle = [];
  for (let i = 0; i < linien.length; i += 1) {
    for (let j = i; j < linien.length; j += 1) {
      crossings(linien[i].pts, linien[j].pts, i === j).forEach((q) => {
        alle.push({ ...q, a: i, b: j });
      });
    }
  }

  // Läuft auch nur einer der beiden Parte dort hinter einem Requisit, sieht
  // man die Kreuzung nicht – der andere läuft schlicht über die Spiere.
  const sichtbar = alle.filter((q) => !versteckt(q.a, q.ia) && !versteckt(q.b, q.ib));
  if (sichtbar.length === 0) {
    meckern('keine einzige Kreuzung – das ist kein Knoten, sondern eine Schnur');
  }

  // --- Liegt an jeder Kreuzung genau ein Part unten? -----------------------
  sichtbar.forEach((q) => {
    const oben = untenAn(q.a, q.ia);
    const unten = untenAn(q.b, q.ib);
    const wo = `${rund(q.x)},${rund(q.y)}`;
    const stellen = `Leine ${q.a} bei ${zuStelle(q.ia)}, Leine ${q.b} bei ${zuStelle(q.ib)}`;
    if (oben && unten) {
      meckern(`Kreuzung ${wo}: beide Parte sind aufgetrennt – da klafft ein Loch (${stellen})`);
    } else if (!oben && !unten) {
      meckern(`Kreuzung ${wo}: kein Part liegt unten – man sieht nicht, welcher `
        + `über welchem läuft (${stellen})`);
    } else {
      console.log(`   Kreuzung ${wo}: Leine ${oben ? q.b : q.a} liegt oben, `
        + `${q.winkel}° (${stellen})`);
    }
    if (q.winkel < WINKEL_MIN) {
      meckern(`Kreuzung ${wo}: nur ${q.winkel}° – die Parte laufen nebeneinanderher, `
        + 'das liest sich nicht als Kreuzung');
    }
  });

  // --- Hat jede Auftrennung ihre Kreuzung? --------------------------------
  // Das ist die Prüfung, die dem ersten Modell gefehlt hat. Eine Lücke ohne
  // Kreuzung ist keine Unterführung, sondern ein Riss.
  linien.forEach(({ linie, pts, l }, nr) => {
    (linie.unter ?? []).forEach((stelle) => {
      const index = zuIndex(stelle);
      const passt = alle.some((q) => (q.a === nr && Math.abs(q.ia - index) < 12)
        || (q.b === nr && Math.abs(q.ib - index) < 12));
      if (!passt) {
        meckern(`Leine ${nr}, Unterführung bei ${stelle}: dort kreuzt nichts – `
          + 'die Lücke ist im Bild ein Riss');
      }
      if (index < 0 || index > pts.length - 1) {
        meckern(`Leine ${nr}, Unterführung bei ${stelle}: liegt außerhalb der Leine`);
        return;
      }
    });

    // Was zwischen zwei Lücken übrig bleibt, muss man noch als Leine erkennen.
    // Ein Stummel von drei Einheiten ist im Bild ein Krümel, und ein Bild aus
    // Krümeln ist genau das, was die ersten Anläufe geliefert haben.
    stuecke(pts, linie.unter ?? []).forEach(([a, b]) => {
      const lang = l[b] - l[a];
      if (lang >= STUECK_MIN) return;
      meckern(`Leine ${nr}: das Stück von ${zuStelle(a)} bis ${zuStelle(b)} ist nur `
        + `${rund(lang)} lang – im Bild ist das ein Krümel, kein Part`);
    });
  });

  // --- Abstand der Kreuzungen ---------------------------------------------
  for (let a = 0; a < sichtbar.length; a += 1) {
    for (let b = a + 1; b < sichtbar.length; b += 1) {
      const dist = Math.hypot(sichtbar[a].x - sichtbar[b].x, sichtbar[a].y - sichtbar[b].y);
      if (dist >= ABSTAND_MIN) continue;
      meckern(`Kreuzungen bei ${rund(sichtbar[a].x)},${rund(sichtbar[a].y)} und `
        + `${rund(sichtbar[b].x)},${rund(sichtbar[b].y)} liegen nur ${rund(dist)} auseinander `
        + '– das wird ein Knäuel');
    }
  }

  // --- Lose Enden ---------------------------------------------------------
  linien.forEach(({ linie, pts }, nr) => {
    [['Anfang', pts[0], linie.anfang], ['Ende', pts[pts.length - 1], linie.ende]]
      .forEach(([wo, p, art]) => {
        if (!drin(p) || art === 'werk') return;
        meckern(`Leine ${nr}: ${wo} bei ${rund(p.x)},${rund(p.y)} hängt in der Luft – `
          + "entweder aus dem Bild heraus oder als loses Ende ('werk')");
      });
  });
}

console.log(mangel ? `\n${mangel} Beanstandung(en)` : '\nnichts zu beanstanden');
process.exit(mangel ? 1 : 0);
