/**
 * Knoten zeichnen.
 *
 * Zwei frühere Versuche, Knoten als freihändige Bézierkurven zu setzen, sind
 * gescheitert – beide ergaben Knäuel, an denen man nichts erkannte. Der Grund
 * war nicht zu wenig Mühe, sondern das falsche Werkzeug: Bei einer Kurve, die
 * man Stützpunkt für Stützpunkt hinschreibt, geht die einzige Frage unter, auf
 * die es bei einem Knoten ankommt – welcher Part liegt über welchem.
 *
 * Deshalb hier anders herum. Eine Leine ist eine Folge von Punkten auf einem
 * Raster; die Rundung rechnet der Code (Catmull-Rom). Und sie ist in
 * Abschnitte geteilt, die in *Tiefe* geordnet gezeichnet werden: Was zuerst
 * kommt, liegt hinten. Jeder Abschnitt bekommt dabei einen Rand in der
 * Hintergrundfarbe, und der schneidet den darunterliegenden Part sauber weg –
 * dieselbe Art, wie eine Seekarte eine Brücke über einen Fluss legt.
 *
 * Die Reihenfolge *entlang der Leine* steht getrennt davon in `n`. Danach
 * richtet sich, was in welchem Schritt schon da ist: So wächst dieselbe
 * Zeichnung Schritt für Schritt, statt dass für jeden Schritt ein eigenes Bild
 * gemalt werden müsste – und was am Ende steht, ist genau das, was man in der
 * Hand hält.
 */

import { svg } from './dom.js';

/**
 * Punkte zu einer runden Kurve.
 *
 * Catmull-Rom durch die Stützpunkte, in kubische Bézier übersetzt. Die Leine
 * geht damit durch jeden angegebenen Punkt hindurch – beim Zeichnen von Hand
 * ist das der Unterschied zwischen „ich lege den Part hierhin“ und „ich hoffe,
 * die Kurve kommt ungefähr dort vorbei“.
 */
export function smooth(points, spannung = 1) {
  const p = points.map(([x, y]) => ({ x, y }));
  if (p.length < 2) return '';
  if (p.length === 2) return `M${p[0].x} ${p[0].y}L${p[1].x} ${p[1].y}`;

  const at = (i) => p[Math.max(0, Math.min(p.length - 1, i))];
  let d = `M${p[0].x} ${p[0].y}`;
  for (let i = 0; i < p.length - 1; i += 1) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const k = spannung / 6;
    const c1x = p1.x + (p2.x - p0.x) * k;
    const c1y = p1.y + (p2.y - p0.y) * k;
    const c2x = p2.x - (p3.x - p1.x) * k;
    const c2y = p2.y - (p3.y - p1.y) * k;
    d += `C${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2.x} ${p2.y}`;
  }
  return d;
}

/**
 * Eine Knotenzeichnung bauen.
 *
 * `drawing.strands` ist die Leine in Abschnitten. Jeder Abschnitt hat:
 *   p  – die Stützpunkte im Raster 0…100
 *   n  – der wievielte Abschnitt entlang der Leine (bestimmt den Schritt)
 *   end – 'werk' zeichnet an das Ende eine Spitze: das lose Ende
 *
 * Die Reihenfolge im Feld ist die Tiefe: Der erste Abschnitt liegt hinten,
 * der letzte oben. `bis` sagt, bis zu welchem Schritt gezeichnet wird.
 */
export function knotFigure(drawing, bis = Infinity, { titel = '' } = {}) {
  const el = svg('svg.knot-fig', {
    viewBox: '0 0 100 100',
    role: titel ? 'img' : null,
    'aria-label': titel || null,
    'aria-hidden': titel ? null : 'true',
  });

  // Woran die Leine liegt – Poller, Ring, Rundholz – gehört hinter alles.
  (drawing.props ?? []).forEach((prop) => el.appendChild(requisit(prop, bis)));

  const sichtbar = (drawing.strands ?? []).filter((s) => (s.n ?? 0) <= bis);

  // Erst alle Ränder, dann alle Kerne? Nein – dann läge jeder Rand über jedem
  // Kern und die Leine wäre gestrichelt. Rand und Kern gehören paarweise
  // übereinander, und die Paare in der Tiefe hintereinander.
  sichtbar.forEach((strand) => {
    const d = smooth(strand.p, strand.spannung ?? 1);
    el.appendChild(svg('path.knot-casing', { d }));
    el.appendChild(svg('path.knot-core', { d }));
  });

  // Das lose Ende bekommt einen Abschluss: Ohne ihn sieht ein abgeschnittener
  // Part aus wie ein Part, der hinter etwas verschwindet.
  const letzte = sichtbar.filter((s) => s.end === 'werk');
  letzte.forEach((strand) => {
    const [x, y] = strand.p[strand.p.length - 1];
    el.appendChild(svg('circle.knot-tip', { cx: x, cy: y, r: 3.2 }));
  });

  return el;
}

/** Poller, Ring, Rundholz, Klampe – das, woran der Knoten sitzt. */
function requisit(prop, bis) {
  if ((prop.n ?? 0) > bis) return svg('g');
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
    const g = svg('g.knot-prop-g');
    g.appendChild(svg('rect.knot-prop', {
      x: prop.x, y: prop.y, width: prop.w, height: prop.h, rx: 3,
    }));
    return g;
  }
  return svg('g');
}
