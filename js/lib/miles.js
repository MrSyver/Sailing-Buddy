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

import { createPdf, A4, mm } from './pdf.js';
import { stats } from './logbook.js';

const LINKS = mm(20);
const RECHTS = A4.width - mm(20);
const BREITE = RECHTS - LINKS;

const datum = (ts, locale) => new Date(ts).toLocaleDateString(locale, {
  day: '2-digit', month: '2-digit', year: 'numeric',
});

const zahl = (v, digits = 1) => (v === null || v === undefined || !Number.isFinite(v)
  ? '—'
  : v.toFixed(digits).replace('.', ','));

/**
 * Baut das Dokument.
 *
 * `texte` bringt alle Beschriftungen mit, damit dieses Modul nichts von der
 * Sprachwahl wissen muss – es rechnet und setzt, es übersetzt nicht.
 */
export function buildMilesPdf({
  track, boat = {}, person = '', skipper = '', qualification = '',
  area = '', role = '', place = '', locale = 'de-DE', texte,
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
  y += kastenHoehe + mm(6);

  pdf.text(LINKS, y, texte.numbersHint, { size: 8, gray: 0.45 });
  y += mm(10);

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
  pdf.text(LINKS, A4.height - mm(14), texte.footer, { size: 7.5, gray: 0.5 });
  pdf.text(RECHTS, A4.height - mm(14),
    new Date().toLocaleString(locale), { size: 7.5, gray: 0.5, align: 'right' });

  return pdf.build();
}

/** Einen Absatz auf mehrere Zeilen verteilen. */
function zeilenUmbruch(pdf, textInhalt, x, y, breite, size, zeilenhoehe) {
  const worte = String(textInhalt).split(/\s+/);
  let zeile = '';
  let zy = y;
  const passt = (s) => (s.length * size * 0.5) < breite;
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
  if (zeile) pdf.text(x, zy, zeile, { size });
  return zy;
}
