/**
 * Die Geometrie hinter den Knotenzeichnungen – ohne Bildschirm.
 *
 * Hier steht das Rechnen, nicht das Zeichnen: Punkte zu einer runden Kurve
 * auflösen, Schnittpunkte finden, die Leine an den Unterführungen auftrennen.
 * Getrennt vom Zeichnen, weil beides dieselben Zahlen braucht – die Anzeige im
 * Browser und das Prüfwerkzeug auf der Kommandozeile. Rechneten sie getrennt,
 * würde das Werkzeug irgendwann etwas anderes prüfen als das, was man sieht,
 * und dann prüft es nichts mehr.
 *
 * Das Modell dahinter ist gegenüber dem ersten Anlauf umgedreht:
 *
 * Früher war eine Leine in Abschnitte zerlegt, die in der Tiefe gestapelt
 * wurden. Das ging schief, weil jeder Abschnitt einen Rand in Hintergrundfarbe
 * bekommt und dieser Rand am Stoß den Nachbarn anschneidet – an jeder
 * Nahtstelle saß eine Kerbe, und die Leine sah aus, als sei sie gerissen.
 *
 * Jetzt ist eine Leine *ein* Zug von Anfang bis Ende. Sie wird nur dort
 * aufgetrennt, wo sie unter etwas hindurchläuft, und genau dort gehört die
 * Lücke ja auch hin: Der darüberliegende Part füllt sie. Damit gibt es keine
 * Naht mehr, die keine ist – jede Lücke im Bild hat einen Grund, und dieser
 * Grund lässt sich nachrechnen.
 */

/** Wie fein eine Kurve aufgelöst wird. Ein Stützpunktabstand = ein Segment. */
export const PRO_SEGMENT = 24;

/** Halbe Lücke an einer Unterführung, in Rastereinheiten. */
export const LUECKE = 5;

/**
 * Punkte zu einer runden Kurve auflösen (Catmull-Rom).
 *
 * Die Leine geht durch jeden Stützpunkt hindurch – beim Zeichnen von Hand ist
 * das der Unterschied zwischen „ich lege den Part hierhin“ und „ich hoffe, die
 * Kurve kommt ungefähr dort vorbei“.
 */
export function sample(points, spannung = 1, proSegment = PRO_SEGMENT) {
  const p = points.map(([x, y]) => ({ x, y }));
  if (p.length < 2) return p;
  const at = (i) => p[Math.max(0, Math.min(p.length - 1, i))];
  const out = [];
  for (let i = 0; i < p.length - 1; i += 1) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const k = spannung / 6;
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

/** Aufsummierte Weglänge entlang der aufgelösten Kurve. */
export function laengen(pts) {
  const l = [0];
  for (let i = 1; i < pts.length; i += 1) {
    l.push(l[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  return l;
}

/** Stützpunktnummer (auch krumm) → Nummer in der aufgelösten Kurve. */
export const zuIndex = (stelle, proSegment = PRO_SEGMENT) => Math.round(stelle * proSegment);

/** Und zurück – damit das Prüfwerkzeug sagen kann, wo eine Kreuzung liegt. */
export const zuStelle = (index, proSegment = PRO_SEGMENT) => Math.round((index / proSegment) * 100) / 100;

/** Schneiden sich zwei Strecken? Gibt Punkt und Lage zurück oder null. */
function cut(a, b, c, d) {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const nenner = r.x * s.y - r.y * s.x;
  if (Math.abs(nenner) < 1e-9) return null;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / nenner;
  const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / nenner;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a.x + t * r.x, y: a.y + t * r.y, t, u };
}

/**
 * Alle Kreuzungen zwischen zwei aufgelösten Kurven.
 *
 * `selbst` heißt: dieselbe Leine mit sich selbst. Dann müssen benachbarte
 * Stücke übersprungen werden, sonst meldet jede Rundung sich selbst.
 *
 * Zurück kommt je Kreuzung der Punkt, die beiden Stellen entlang der Leinen
 * und der Winkel, in dem sie sich schneiden – den braucht man, weil zwei
 * Parte, die sich unter zwanzig Grad treffen, im Bild nebeneinanderher laufen
 * und keine erkennbare Kreuzung ergeben.
 */
export function crossings(A, B, selbst = false) {
  const treffer = [];
  for (let i = 0; i < A.length - 1; i += 1) {
    const von = selbst ? i + PRO_SEGMENT / 2 : 0;
    for (let j = von; j < B.length - 1; j += 1) {
      const q = cut(A[i], A[i + 1], B[j], B[j + 1]);
      if (!q) continue;
      if (treffer.some((p) => Math.hypot(p.x - q.x, p.y - q.y) < 3)) continue;
      const ra = { x: A[i + 1].x - A[i].x, y: A[i + 1].y - A[i].y };
      const rb = { x: B[j + 1].x - B[j].x, y: B[j + 1].y - B[j].y };
      const la = Math.hypot(ra.x, ra.y) || 1;
      const lb = Math.hypot(rb.x, rb.y) || 1;
      const skalar = Math.abs((ra.x * rb.x + ra.y * rb.y) / (la * lb));
      treffer.push({
        x: q.x,
        y: q.y,
        ia: i + q.t,
        ib: j + q.u,
        winkel: Math.round((Math.acos(Math.max(-1, Math.min(1, skalar))) * 180) / Math.PI),
      });
    }
  }
  return treffer;
}

/**
 * Die Leine in sichtbare Stücke zerlegen.
 *
 * `unten` sind die Stellen, an denen sie unter etwas hindurchläuft – dort
 * bleibt eine Lücke von zweimal `LUECKE`, und der darüberliegende Part füllt
 * sie. Alles dazwischen wird gezeichnet.
 */
export function stuecke(pts, unten = [], luecke = LUECKE) {
  const l = laengen(pts);
  const raus = unten
    .map((stelle) => {
      const mitte = Math.max(0, Math.min(pts.length - 1, zuIndex(stelle)));
      const s = l[mitte];
      let a = mitte;
      let b = mitte;
      while (a > 0 && s - l[a] < luecke) a -= 1;
      while (b < pts.length - 1 && l[b] - s < luecke) b += 1;
      return [a, b];
    })
    .sort((x, y) => x[0] - y[0]);

  // Überlappende Lücken sind eine Lücke. Zwei Unterführungen so dicht
  // beieinander, dass sich die Lücken berühren, sind ohnehin ein Fehler –
  // das Prüfwerkzeug sagt es, hier wird nur nichts kaputtgemacht.
  const luecken = [];
  raus.forEach(([a, b]) => {
    const letzt = luecken[luecken.length - 1];
    if (letzt && a <= letzt[1]) letzt[1] = Math.max(letzt[1], b);
    else luecken.push([a, b]);
  });

  const teile = [];
  let von = 0;
  luecken.forEach(([a, b]) => {
    if (a > von) teile.push([von, a]);
    von = b;
  });
  if (von < pts.length - 1) teile.push([von, pts.length - 1]);
  return teile;
}
