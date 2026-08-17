/**
 * Knoten zeichnen.
 *
 * Drei Anläufe hat es gebraucht, und die ersten beiden sind am selben Punkt
 * gescheitert: Sie haben die Leine in gestapelte Abschnitte zerlegt. Das klingt
 * naheliegend – oben liegt, was zuletzt gezeichnet wird –, hat aber einen
 * Haken, den man erst im fertigen Bild sieht. Jeder Abschnitt bekommt einen
 * Rand in Hintergrundfarbe, damit er den Part unter sich freistellt. Dieser
 * Rand schneidet aber auch dort, wo die Leine schlicht weiterläuft, und an
 * jeder Nahtstelle saß deshalb eine Kerbe. Vierzehn Knoten mit je einem halben
 * Dutzend Nahtstellen sind vierzehn zerrissene Leinen.
 *
 * Deshalb jetzt andersherum, und zwar so, wie Knoten seit jeher gezeichnet
 * werden: Die Leine ist *ein* durchgehender Zug. Aufgetrennt wird sie nur da,
 * wo sie unter etwas hindurchläuft – und dort gehört die Lücke hin, weil der
 * darüberliegende Part sie füllt. Eine Lücke ohne Kreuzung kann es damit gar
 * nicht mehr geben, und das ist der ganze Unterschied.
 *
 * Und damit ist auch der Rand in Hintergrundfarbe überflüssig geworden, der in
 * den ersten Anläufen die ganze Arbeit machen sollte. Er hat nur noch geschadet:
 * Über einer Spiere ist der Hintergrund nicht die Farbe der Spiere, und so
 * malte er in jede Lücke einen dunklen Fleck, der aussah wie ein Loch im Holz.
 * Wo sich nichts überlappt, braucht es auch nichts, das etwas freistellt.
 */

import { svg } from './dom.js';
import { sample, stuecke, zuIndex } from './knotgeom.js';

/**
 * Eine Knotenzeichnung bauen.
 *
 * `drawing.lines` sind die Leinen. Jede hat:
 *   p       – die Stützpunkte im Raster 0…100
 *   unter   – Stellen, an denen sie unter etwas hindurchläuft (Stützpunktnummer,
 *             auch krumm: 3.5 liegt zwischen dem vierten und fünften Punkt)
 *   hinter  – Bereiche [von, bis], die hinter einem Requisit liegen
 *   leine   – 2 für die zweite Leine in eigener Farbe
 *   ende    – 'werk' setzt an das Ende das lose Ende
 *   anfang  – dasselbe für den Anfang
 */
export function knotFigure(drawing, { titel = '' } = {}) {
  const el = svg('svg.knot-fig', {
    viewBox: '0 0 100 100',
    role: titel ? 'img' : null,
    'aria-label': titel || null,
    'aria-hidden': titel ? null : 'true',
  });

  const vorn = [];
  const hinten = [];
  const enden = [];

  (drawing.lines ?? []).forEach((linie) => {
    const pts = sample(linie.p, linie.spannung ?? 1);
    const versteckt = (linie.hinter ?? []).map(([a, b]) => [zuIndex(a), zuIndex(b)]);

    stuecke(pts, linie.unter ?? []).forEach(([a, b]) => {
      // Ein Stück, das hinter einem Requisit durchläuft, zerfällt noch einmal:
      // Was dahinter liegt, wird vor dem Requisit gezeichnet und damit von ihm
      // verdeckt. Ohne diese Trennung liefe jeder Törn vor der Spiere entlang,
      // und man sähe nicht, dass die Leine sie umschlingt.
      teilen([a, b], versteckt).forEach(([von, bis, dahinter]) => {
        if (bis - von < 2) return;
        (dahinter ? hinten : vorn).push({ d: pfad(pts, von, bis), linie });
      });
    });

    // Das lose Ende bekommt einen Abschluss: Ohne ihn sieht ein abgeschnittener
    // Part aus wie ein Part, der hinter etwas verschwindet.
    if (linie.anfang === 'werk') enden.push({ tip: pts[0], linie });
    if (linie.ende === 'werk') enden.push({ tip: pts[pts.length - 1], linie });
  });

  const male = (liste) => liste.forEach(({ d, linie }) => el.appendChild(
    svg(`path.knot-core${linie.leine === 2 ? '.knot-core-b' : ''}`, { d }),
  ));

  male(hinten);
  (drawing.props ?? []).forEach((prop) => el.appendChild(requisit(prop)));
  male(vorn);
  enden.forEach(({ tip, linie }) => el.appendChild(
    svg(`circle.knot-tip${linie.leine === 2 ? '.knot-tip-b' : ''}`, {
      cx: rund(tip.x), cy: rund(tip.y), r: 2.75,
    }),
  ));

  return el;
}

const rund = (n) => Math.round(n * 100) / 100;

/** Ein Stück der aufgelösten Kurve als Pfad. */
function pfad(pts, von, bis) {
  let d = `M${rund(pts[von].x)} ${rund(pts[von].y)}`;
  for (let i = von + 1; i <= bis; i += 1) d += `L${rund(pts[i].x)} ${rund(pts[i].y)}`;
  return d;
}

/** Ein Stück an den verdeckten Bereichen auftrennen. */
function teilen([a, b], versteckt) {
  const grenzen = [a, b];
  versteckt.forEach(([v, w]) => {
    if (v > a && v < b) grenzen.push(v);
    if (w > a && w < b) grenzen.push(w);
  });
  grenzen.sort((x, y) => x - y);
  const raus = [];
  for (let i = 0; i < grenzen.length - 1; i += 1) {
    const mitte = (grenzen[i] + grenzen[i + 1]) / 2;
    raus.push([grenzen[i], grenzen[i + 1], versteckt.some(([v, w]) => mitte > v && mitte < w)]);
  }
  return raus;
}

/** Poller, Ring, Rundholz, Klampe – das, woran der Knoten sitzt. */
function requisit(prop) {
  if (prop.art === 'rund') {
    return svg('circle.knot-prop', { cx: prop.x, cy: prop.y, r: prop.r });
  }
  if (prop.art === 'ring') {
    return svg('circle.knot-prop.knot-prop-ring', { cx: prop.x, cy: prop.y, r: prop.r });
  }
  if (prop.art === 'balken') {
    return svg('rect.knot-prop', {
      x: prop.x, y: prop.y, width: prop.w, height: prop.h, rx: prop.rx ?? 2,
    });
  }
  if (prop.art === 'klampe') {
    // Eine Klampe von vorn: ein Fuß, darauf der Körper mit zwei Hörnern.
    const g = svg('g');
    g.appendChild(svg('rect.knot-prop', {
      x: prop.x - prop.w / 2, y: prop.y - 3, width: prop.w, height: 9, rx: 4,
    }));
    [-1, 1].forEach((s) => g.appendChild(svg('path.knot-prop', {
      d: `M${prop.x + s * (prop.w / 2 - 2)} ${prop.y + 2}`
        + `q${s * 9} -1 ${s * 11} -7`
        + `q${s * 1} 5 ${s * -3} 8Z`,
    })));
    g.appendChild(svg('rect.knot-prop', {
      x: prop.x - 5, y: prop.y + 5, width: 10, height: prop.h ?? 10, rx: 2,
    }));
    return g;
  }
  return svg('g');
}
