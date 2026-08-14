/**
 * Meilenbestätigung als PDF.
 *
 * Was hier entsteht, ist kein amtliches Formular und gibt auch nicht vor,
 * eines zu sein. Es ist die geordnete Abschrift dessen, was im Logbuch steht,
 * mit einer Zeile für die Unterschrift des Schiffsführers – denn genau die
 * macht aus Zahlen eine Bestätigung. Ob ein Verband oder eine Prüfungsstelle
 * sie in dieser Form annimmt, entscheidet der Verband, nicht diese App; das
 * steht auch im Dokument.
 *
 * Alle Zahlen kommen aus den Einträgen und nirgends sonst. Wo eine Angabe
 * fehlt, bleibt das Feld leer und wird zum Ausfüllen von Hand angeboten,
 * statt geraten zu werden. Eine Bestätigung mit erfundenen Zahlen wäre
 * schlimmer als keine.
 */

import { createPdf, A4, mm, textWidth } from './pdf.js';
import { stats, trackDistance, projectTrack, niceScaleStep } from './logbook.js';
import { formatLat, formatLon } from './geo.js';

const LINKS = mm(20);
const RECHTS = A4.width - mm(20);
const BREITE = RECHTS - LINKS;
const FUSS = A4.height - mm(20);

const datum = (ts, locale) => new Date(ts).toLocaleDateString(locale, {
  day: '2-digit', month: '2-digit', year: 'numeric',
});

const uhrzeit = (ts, locale) => new Date(ts).toLocaleTimeString(locale, {
  hour: '2-digit', minute: '2-digit',
});

const zahl = (v, digits = 1) => (v === null || v === undefined || !Number.isFinite(v)
  ? '—'
  : v.toFixed(digits).replace('.', ','));

/** Stunden und Minuten aus einer Zeitspanne in Millisekunden. */
function dauer(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const minuten = Math.round(ms / 60000);
  return `${Math.floor(minuten / 60)}:${String(minuten % 60).padStart(2, '0')} h`;
}

/** Eine Zeichenkette so kürzen, dass sie in eine Spalte passt. */
function kuerzen(s, size, breite) {
  let text = String(s ?? '');
  if (textWidth(text, size) <= breite) return text;
  while (text.length > 1 && textWidth(`${text}…`, size) > breite) text = text.slice(0, -1);
  return `${text}…`;
}

/**
 * Baut das Dokument.
 *
 * `texte` bringt alle Beschriftungen mit, damit dieses Modul nichts von der
 * Sprachwahl wissen muss – es rechnet und setzt, es übersetzt nicht.
 */
export function buildMilesPdf({
  track, boat = {}, person = '', skipper = '', qualification = '',
  area = '', role = '', place = '', notes = '', detail = false, turns = [],
  locale = 'de-DE', texte,
}) {
  const k = stats(track);
  if (!k) return null;

  const pdf = createPdf({ title: texte.title, author: skipper || boat.name || '' });
  pdf.addPage();

  let y = mm(24);

  // --- Kopf ---------------------------------------------------------------
  pdf.text(LINKS, y, texte.title, { size: 20, bold: true });
  y += mm(8);
  pdf.text(LINKS, y, texte.subtitle, { size: 9.5, gray: 0.35 });
  pdf.line(LINKS, y + mm(3), RECHTS, y + mm(3), { width: 1 });
  y += mm(12);

  /** Eine Zeile aus Beschriftung und Wert; leere Werte bekommen eine Linie. */
  const feld = (label, wert, { breit = false, x = LINKS, w = BREITE } = {}) => {
    pdf.text(x, y, label, { size: 8.5, gray: 0.4 });
    if (wert) {
      pdf.text(x, y + mm(5.5), String(wert), { size: breit ? 12 : 11, bold: breit });
    }
    pdf.line(x, y + mm(7), x + w, y + mm(7), { width: 0.5, gray: 0.6 });
  };

  /** Zwei Felder nebeneinander. */
  const paar = (l1, w1, l2, w2) => {
    const halb = (BREITE - mm(8)) / 2;
    feld(l1, w1, { w: halb });
    feld(l2, w2, { x: LINKS + halb + mm(8), w: halb });
    y += mm(13);
  };

  // --- Wer ----------------------------------------------------------------
  pdf.text(LINKS, y, texte.sectionPerson, { size: 9, bold: true, gray: 0.3 });
  y += mm(7);
  feld(texte.person, person, { breit: true });
  y += mm(13);
  paar(texte.role, role, texte.area, area);

  // --- Schiff -------------------------------------------------------------
  pdf.text(LINKS, y, texte.sectionBoat, { size: 9, bold: true, gray: 0.3 });
  y += mm(7);
  paar(texte.boatName, boat.name, texte.boatCallsign,
    [boat.callsign, boat.mmsi].filter(Boolean).join(' · '));
  paar(texte.boatLoa, boat.loa ? `${boat.loa} m` : '', texte.boatHome, boat.homeport);

  // --- Fahrt --------------------------------------------------------------
  pdf.text(LINKS, y, texte.sectionTrip, { size: 9, bold: true, gray: 0.3 });
  y += mm(7);
  paar(texte.from, datum(k.from, locale), texte.to, datum(k.to, locale));

  // --- Die Zahlen ---------------------------------------------------------
  // Als Kasten, weil sie der Grund für das ganze Blatt sind.
  const kastenHoehe = mm(30);
  pdf.rect(LINKS, y, BREITE, kastenHoehe, { width: 1 });

  const spalte = BREITE / 4;
  const zelle = (i, label, wert, einheit) => {
    const x = LINKS + spalte * i + spalte / 2;
    pdf.text(x, y + mm(8), label, { size: 8, gray: 0.4, align: 'center' });
    pdf.text(x, y + mm(18), wert, { size: 17, bold: true, align: 'center' });
    pdf.text(x, y + mm(24), einheit, { size: 8.5, gray: 0.4, align: 'center' });
  };
  zelle(0, texte.milesTotal, zahl(k.distance), 'sm');
  zelle(1, texte.milesNight, zahl(k.nightDistance), 'sm');
  zelle(2, texte.milesEngine, zahl(k.engineDistance), 'sm');
  zelle(3, texte.daysAboard, String(Math.max(1, k.days)), texte.daysUnit);
  y += kastenHoehe + mm(10);

  // --- Anmerkungen --------------------------------------------------------
  // Nur wenn welche da sind: Eine leere Überschrift auf einem Blatt, das
  // jemand unterschreibt, sieht aus wie eine vergessene Angabe.
  if (notes) {
    pdf.text(LINKS, y, texte.notesHead, { size: 9, bold: true, gray: 0.3 });
    y += mm(6);
    y = zeilenUmbruch(pdf, notes, LINKS, y, BREITE, 9.5, mm(4.6)) + mm(8);
  }

  // --- Erklärung ----------------------------------------------------------
  pdf.text(LINKS, y, texte.declarationHead, { size: 9, bold: true, gray: 0.3 });
  y += mm(6);
  zeilenUmbruch(pdf, texte.declaration, LINKS, y, BREITE, 9.5, mm(4.6));
  y += mm(16);

  // --- Unterschrift -------------------------------------------------------
  const halb = (BREITE - mm(10)) / 2;
  pdf.text(LINKS, y, texte.skipper, { size: 8.5, gray: 0.4 });
  if (skipper) pdf.text(LINKS, y + mm(6), skipper, { size: 11 });
  if (qualification) pdf.text(LINKS, y + mm(11), qualification, { size: 8.5, gray: 0.4 });
  pdf.line(LINKS, y + mm(14), LINKS + halb, y + mm(14), { width: 0.5, gray: 0.6 });

  const x2 = LINKS + halb + mm(10);
  pdf.text(x2, y, texte.placeDate, { size: 8.5, gray: 0.4 });
  pdf.text(x2, y + mm(6),
    [place, new Date().toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })]
      .filter(Boolean).join(', '), { size: 11 });
  pdf.line(x2, y + mm(14), x2 + halb, y + mm(14), { width: 0.5, gray: 0.6 });

  y += mm(34);
  // Das eigentliche Unterschriftenfeld: großzügig, damit auch eine
  // schwungvolle Unterschrift hineinpasst.
  pdf.line(LINKS, y, LINKS + halb, y, { width: 1 });
  pdf.text(LINKS, y + mm(4.5), texte.signature, { size: 8.5, gray: 0.4 });

  // --- Fuß ----------------------------------------------------------------
  fuss(pdf, texte, locale);

  // --- Der ausführliche Nachweis ------------------------------------------
  // Freiwillig, und deshalb hinten: Das erste Blatt ist die Bestätigung, die
  // unterschrieben wird. Was danach kommt, belegt sie – Route, Etappen,
  // Einträge. Wer das nicht braucht, hat es auch nicht auf dem Blatt.
  if (detail) detailSeiten(pdf, { track, turns, person, boat, locale, texte });

  return pdf.build();
}

/** Fußzeile: Herkunft links, Erstellungszeitpunkt rechts. */
function fuss(pdf, texte, locale) {
  pdf.text(LINKS, A4.height - mm(14), texte.footer, { size: 7.5, gray: 0.5 });
  pdf.text(RECHTS, A4.height - mm(14),
    new Date().toLocaleString(locale), { size: 7.5, gray: 0.5, align: 'right' });
}

/**
 * Die Anlage: Route, Etappen, Einträge.
 *
 * Eine Zahl im Kasten sagt „147,3 sm“. Wer sie prüfen will oder wer den Törn
 * in zehn Jahren wiederfinden möchte, braucht mehr: die Spur, die Etappen
 * darin und die Einträge, aus denen beides entstanden ist. Genau das steht
 * hier – so viele Seiten, wie die Einträge brauchen.
 */
function detailSeiten(pdf, { track, turns, person, boat, locale, texte }) {
  pdf.addPage();
  let y = mm(24);

  pdf.text(LINKS, y, texte.detailTitle, { size: 16, bold: true });
  y += mm(6.5);
  pdf.text(LINKS, y, [person, boat.name].filter(Boolean).join(' · '),
    { size: 9.5, gray: 0.35 });
  pdf.line(LINKS, y + mm(3), RECHTS, y + mm(3), { width: 1 });
  y += mm(12);

  // --- Die Spur -----------------------------------------------------------
  pdf.text(LINKS, y, texte.routeHead, { size: 9, bold: true, gray: 0.3 });
  y += mm(6);
  y = spurZeichnen(pdf, track, y, texte, locale) + mm(10);

  // --- Etappen ------------------------------------------------------------
  y = etappenTabelle(pdf, { track, turns, y, locale, texte });

  // --- Einträge -----------------------------------------------------------
  eintraegeTabelle(pdf, { track, y, locale, texte });
}

/**
 * Die Spur, nordorientiert, mit Maßstabsbalken.
 *
 * Ohne Kartenmaterial – dieselbe Zeichnung wie im Logbuch. Sie täuscht keine
 * Tiefen und keine Küstenlinien vor, die sie nicht hat; was sie zeigt, ist
 * der gefahrene Weg, und darum geht es hier.
 */
function spurZeichnen(pdf, track, y, texte, locale) {
  const hoehe = mm(78);
  pdf.rect(LINKS, y, BREITE, hoehe, { width: 0.7, gray: 0.6 });

  const punkte = track.filter((e) => Number.isFinite(e.lat) && Number.isFinite(e.lon));
  if (punkte.length < 2) {
    pdf.text(LINKS + BREITE / 2, y + hoehe / 2, texte.noRoute,
      { size: 9.5, gray: 0.45, align: 'center' });
    return y + hoehe;
  }

  const proj = projectTrack(punkte, BREITE, hoehe, mm(9));
  const abs = proj.points.map((p) => ({ x: LINKS + p.x, y: y + p.y, point: p.point }));

  pdf.polyline(abs, { width: 1, gray: 0.15 });

  // Anfang und Ende: hohl und voll, damit man ohne Legende weiß, wohin es ging.
  const start = abs[0];
  const ende = abs[abs.length - 1];
  pdf.dot(start.x, start.y, 3.2, { gray: 1 });
  pdf.dot(start.x, start.y, 2.0, { gray: 0.35 });
  pdf.dot(ende.x, ende.y, 3.2, { gray: 0 });
  // Die Beschriftungen nach entgegengesetzten Seiten: Fängt ein Törn dort an,
  // wo er endet – eine Runde, ein Hafen –, liegen die Punkte übereinander,
  // und zwei Wörter an derselben Stelle sind keins.
  pdf.text(start.x + mm(2.4), start.y - mm(1.4), texte.routeStart, { size: 7.5, gray: 0.4 });
  pdf.text(ende.x + mm(2.4), ende.y + mm(3.4), texte.routeEnd, { size: 7.5, gray: 0.4 });

  // Nordpfeil oben rechts – die Zeichnung ist nordorientiert, und das muss
  // draufstehen, sonst liest sie jemand als Kartenausschnitt.
  const nx = RECHTS - mm(8);
  const ny = y + mm(8);
  pdf.line(nx, ny + mm(6), nx, ny - mm(1), { width: 1 });
  pdf.line(nx, ny - mm(1), nx - mm(1.5), ny + mm(1.5), { width: 1 });
  pdf.line(nx, ny - mm(1), nx + mm(1.5), ny + mm(1.5), { width: 1 });
  pdf.text(nx, ny + mm(10), texte.north, { size: 8, bold: true, align: 'center' });

  // Maßstabsbalken unten links.
  //
  // Der runde Schritt wird kleiner gewählt, solange der Balken breiter wäre
  // als ein Drittel des Bildes. Liegt das Schiff still, ist die Spanne die
  // angenommene Mindestspanne – und ein Balken, der über das ganze Blatt
  // reicht, sagt dann nichts mehr über den Maßstab, sondern verdeckt ihn.
  let schritt = niceScaleStep(proj.spanNm);
  while (schritt > 0.01 && schritt * proj.scale > BREITE / 3) schritt /= 2;
  const balken = schritt * proj.scale;
  const bx = LINKS + mm(6);
  const by = y + hoehe - mm(7);
  pdf.line(bx, by, bx + balken, by, { width: 1.2 });
  pdf.line(bx, by - mm(1.5), bx, by + mm(1.5), { width: 1.2 });
  pdf.line(bx + balken, by - mm(1.5), bx + balken, by + mm(1.5), { width: 1.2 });
  pdf.text(bx, by - mm(2.5), `${zahl(schritt, schritt < 1 ? 2 : 0)} sm`,
    { size: 8, gray: 0.35 });


  // Der Ausschnitt in Zahlen – damit sich die Zeichnung wiederfinden lässt.
  // Oben links, nicht unten rechts: Unten steht der Maßstabsbalken, und wie
  // breit der wird, hängt vom Törn ab.
  const lats = punkte.map((p) => p.lat);
  const lons = punkte.map((p) => p.lon);
  pdf.text(LINKS + mm(4), y + mm(5),
    `${formatLat(Math.min(...lats), 1)} – ${formatLat(Math.max(...lats), 1)} · `
    + `${formatLon(Math.min(...lons), 1)} – ${formatLon(Math.max(...lons), 1)}`,
    { size: 7.5, gray: 0.45 });

  return y + hoehe;
}

/** Die Etappen mit ihren Zahlen – oder die ganze Fahrt als eine Zeile. */
function etappenTabelle(pdf, { track, turns, y, locale, texte }) {
  pdf.text(LINKS, y, texte.legsHead, { size: 9, bold: true, gray: 0.3 });
  y += mm(6);

  // Jede Etappe bekommt die Einträge, die ihr zugeordnet sind. Was zu keiner
  // gehört, steht am Ende als „Ohne Etappe“ – weggelassen wird nichts, sonst
  // stimmten die Summen der Tabelle nicht mit dem Kasten auf Seite eins.
  const gruppen = (turns ?? []).map((r) => ({
    name: r.name || texte.legUnnamed,
    von: r.from,
    bis: r.to,
    eintraege: track.filter((e) => e.turnId === r.id),
  })).filter((g) => g.eintraege.length);

  const ids = new Set((turns ?? []).map((r) => r.id));
  const lose = track.filter((e) => !ids.has(e.turnId));
  if (lose.length) {
    gruppen.push({
      name: gruppen.length ? texte.legNone : texte.wholeTrip,
      von: '', bis: '', eintraege: lose,
    });
  }

  const spalten = [
    { w: BREITE * 0.34, align: 'left' },
    { w: BREITE * 0.28, align: 'left' },
    { w: BREITE * 0.19, align: 'right' },
    { w: BREITE * 0.19, align: 'right' },
  ];
  const xVon = (i) => LINKS + spalten.slice(0, i).reduce((s, c) => s + c.w, 0);
  const zelle = (i, wert, opts) => {
    const c = spalten[i];
    const x = c.align === 'right' ? xVon(i) + c.w : xVon(i);
    pdf.text(x, y, kuerzen(wert, opts.size ?? 9, c.w - mm(2)), { ...opts, align: c.align });
  };

  const kopf = [texte.colLeg, texte.colPeriod, texte.colDistance, texte.colDuration];
  kopf.forEach((s, i) => zelle(i, s, { size: 8, gray: 0.4, bold: true }));
  y += mm(2);
  pdf.line(LINKS, y, RECHTS, y, { width: 0.5, gray: 0.6 });
  y += mm(5);

  gruppen.forEach((g) => {
    const e = g.eintraege;
    const von = e[0].ts;
    const bis = e[e.length - 1].ts;
    const wegNach = [g.von, g.bis].filter(Boolean).join(' → ');
    zelle(0, g.name, { size: 9.5 });
    zelle(1, `${datum(von, locale)} – ${datum(bis, locale)}`, { size: 9 });
    zelle(2, `${zahl(trackDistance(e))} sm`, { size: 9.5, bold: true });
    zelle(3, dauer(bis - von), { size: 9 });
    y += mm(4.6);
    if (wegNach) {
      pdf.text(xVon(0), y, kuerzen(wegNach, 8, spalten[0].w + spalten[1].w - mm(2)),
        { size: 8, gray: 0.45 });
      y += mm(4);
    }
    y += mm(1.4);
  });

  pdf.line(LINKS, y - mm(2), RECHTS, y - mm(2), { width: 0.5, gray: 0.75 });
  return y + mm(6);
}

/**
 * Die Einträge, so viele wie es sind.
 *
 * Sie laufen über so viele Seiten, wie sie brauchen. Ein Nachweis, der bei
 * Eintrag vierzig abbricht, wäre keiner – man merkt es erst, wenn jemand
 * nachrechnet.
 */
function eintraegeTabelle(pdf, { track, y, locale, texte }) {
  const spalten = [
    { w: BREITE * 0.12, align: 'left' },
    { w: BREITE * 0.32, align: 'left' },
    { w: BREITE * 0.11, align: 'right' },
    { w: BREITE * 0.45, align: 'left' },
  ];
  const xVon = (i) => LINKS + spalten.slice(0, i).reduce((s, c) => s + c.w, 0);
  // Rechtsbündige Spalten enden ein Stück vor der Spaltenkante: Sonst stößt
  // „Fahrt“ genau dort an, wo „Ereignis“ anfängt, und die Kopfzeile liest
  // sich als ein Wort.
  const zelle = (i, wert, opts) => {
    const c = spalten[i];
    const luft = mm(3);
    const x = c.align === 'right' ? xVon(i) + c.w - luft : xVon(i);
    pdf.text(x, y, kuerzen(wert, opts.size ?? 8.5, c.w - luft - mm(1)), { ...opts, align: c.align });
  };

  const kopfZeile = () => {
    pdf.text(LINKS, y, texte.entriesHead, { size: 9, bold: true, gray: 0.3 });
    y += mm(6);
    [texte.colTime, texte.colPosition, texte.colSpeed, texte.colEntry]
      .forEach((s, i) => zelle(i, s, { size: 8, gray: 0.4, bold: true }));
    y += mm(2);
    pdf.line(LINKS, y, RECHTS, y, { width: 0.5, gray: 0.6 });
    y += mm(4.6);
  };

  kopfZeile();

  let tag = null;
  track.forEach((e) => {
    // Neue Seite, bevor die Zeile in die Fußzeile läuft.
    if (y > FUSS - mm(12)) {
      fuss(pdf, texte, locale);
      pdf.addPage();
      y = mm(24);
      kopfZeile();
      tag = null;
    }

    // Das Datum steht einmal je Tag, nicht in jeder Zeile: Sonst liest man
    // vierzigmal dasselbe und findet den Tageswechsel trotzdem nicht.
    const heute = datum(e.ts, locale);
    if (heute !== tag) {
      tag = heute;
      pdf.text(LINKS, y, heute, { size: 8.5, bold: true, gray: 0.25 });
      y += mm(4.4);
    }

    const beschriftung = [
      e.event ? (texte.events?.[e.event] ?? e.event) : '',
      e.note,
    ].filter(Boolean).join(' – ');

    zelle(0, uhrzeit(e.ts, locale), { size: 8.5, gray: 0.35 });
    // Grad und Minuten, nicht Dezimalgrad: So steht es in der Seekarte, so
    // sagt man es über Funk, und so lässt es sich nachschlagen.
    zelle(1, `${formatLat(e.lat, 2)}  ${formatLon(e.lon, 2)}`, { size: 8.5 });
    zelle(2, Number.isFinite(e.sog) ? `${zahl(e.sog)} kn` : '', { size: 8.5, gray: 0.35 });
    zelle(3, beschriftung, { size: 8.5 });
    y += mm(4.2);
  });

  pdf.line(LINKS, y - mm(1), RECHTS, y - mm(1), { width: 0.5, gray: 0.75 });
  y += mm(4);
  pdf.text(LINKS, y, texte.entriesCount.replace('{n}', String(track.length)),
    { size: 8, gray: 0.45 });

  fuss(pdf, texte, locale);
}

/**
 * Einen Absatz auf mehrere Zeilen verteilen.
 *
 * Selbst gesetzte Umbrüche bleiben stehen: Wer in den Anmerkungen drei Punkte
 * untereinander schreibt, meint drei Zeilen und keinen Fließtext.
 */
function zeilenUmbruch(pdf, textInhalt, x, y, breite, size, zeilenhoehe) {
  const passt = (s) => (s.length * size * 0.5) < breite;
  let zy = y;
  String(textInhalt).split(/\r?\n/).forEach((absatz) => {
    const worte = absatz.trim().split(/\s+/).filter(Boolean);
    if (!worte.length) { zy += zeilenhoehe; return; }
    let zeile = '';
    worte.forEach((wort) => {
      const versuch = zeile ? `${zeile} ${wort}` : wort;
      if (passt(versuch)) {
        zeile = versuch;
      } else {
        pdf.text(x, zy, zeile, { size });
        zy += zeilenhoehe;
        zeile = wort;
      }
    });
    if (zeile) { pdf.text(x, zy, zeile, { size }); zy += zeilenhoehe; }
  });
  return zy - zeilenhoehe;
}
