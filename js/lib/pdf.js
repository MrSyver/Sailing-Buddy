/**
 * Ein sehr kleiner PDF-Schreiber.
 *
 * Warum von Hand und nicht mit einer Bibliothek: Eine Meilenbestätigung soll
 * auch dort entstehen, wo es kein Netz gibt, und die App bringt bewusst keine
 * fremden Programmteile mit. Ein PDF mit Text und ein paar Linien ist ein
 * überschaubares Format – die vierzehn Standardschriften stecken in jedem
 * Betrachter, es muss also nichts eingebettet werden.
 *
 * Bewusst unkomprimiert. Die Datei wird ein paar Kilobyte größer und ist dafür
 * mit einem Texteditor zu lesen; wer wissen will, was er da unterschreibt,
 * kann nachsehen.
 *
 * Der Ursprung liegt in PDF unten links. Nach oben zu rechnen ist beim
 * Schreiben eines Formulars unbrauchbar, deshalb nimmt diese Schnittstelle
 * `y` von oben und dreht selbst um.
 */

/** A4 in Punkten (1 pt = 1/72 Zoll). */
export const A4 = { width: 595.28, height: 841.89 };

/** Millimeter in Punkte – Papiermaße denkt niemand in Punkten. */
export const mm = (v) => (v * 72) / 25.4;

/**
 * Umlaute und Striche nach WinAnsi.
 *
 * Die Standardschriften werden mit WinAnsiEncoding angesprochen. Bis 0xFF
 * stimmt das mit Unicode überein – bis auf die Zeichen zwischen 0x80 und
 * 0x9F, und ausgerechnet dort liegen der Gedankenstrich und die
 * typografischen Anführungszeichen, die in dieser App überall vorkommen.
 */
const WIN_ANSI = new Map([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84],
  [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88],
  [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c],
  [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93],
  [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b],
  [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f],
]);

function encodeText(s) {
  let out = '';
  for (const ch of String(s)) {
    const code = ch.codePointAt(0);
    let byte;
    if (code < 0x100) byte = code;
    else if (WIN_ANSI.has(code)) byte = WIN_ANSI.get(code);
    // Was die Schrift nicht kennt, wird zu einem Fragezeichen statt zu einem
    // kaputten Zeichen: Ein sichtbares Loch ist ehrlicher als Kauderwelsch.
    else byte = 0x3f;
    // Klammern und Gegenschrägstrich beenden sonst die Zeichenkette.
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) out += '\\';
    out += String.fromCharCode(byte);
  }
  return out;
}

/**
 * Breite eines Textes in Punkten.
 *
 * Die Breitentabelle von Helvetica, damit sich Text rechtsbündig setzen und
 * mittig stellen lässt. Für die Ziffern und die gängigen Buchstaben genau,
 * für den Rest eine gute Näherung – es geht um Formularfelder, nicht um
 * Buchsatz.
 */
const WIDTHS = {
  ' ': 278, '!': 278, '"': 355, '#': 556, '$': 556, '%': 889, '&': 667, "'": 191,
  '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
  0: 556, 1: 556, 2: 556, 3: 556, 4: 556, 5: 556, 6: 556, 7: 556, 8: 556, 9: 556,
  ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556, '@': 1015,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500,
  K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
  U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222,
  k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278,
  u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
};

export function textWidth(s, size, bold = false) {
  let sum = 0;
  for (const ch of String(s)) sum += WIDTHS[ch] ?? 556;
  // Fett ist bei Helvetica rund sechs Prozent breiter.
  return (sum / 1000) * size * (bold ? 1.06 : 1);
}

/**
 * Legt ein Dokument an.
 *
 * Rückgabe: `{ addPage, text, line, rect, build }`. `build()` liefert die
 * fertige Datei als Uint8Array.
 */
export function createPdf({ title = '', author = '' } = {}) {
  const pages = [];
  let current = null;

  function addPage() {
    current = { ops: [] };
    pages.push(current);
    return current;
  }

  /** Text setzen. `y` zählt von oben. `align` ist 'left', 'right' oder 'center'. */
  function text(x, y, value, {
    size = 11, bold = false, align = 'left', gray = 0,
  } = {}) {
    if (!current) addPage();
    const str = String(value ?? '');
    if (!str) return;
    let px = x;
    if (align === 'right') px = x - textWidth(str, size, bold);
    if (align === 'center') px = x - textWidth(str, size, bold) / 2;
    const py = A4.height - y;
    current.ops.push(
      `${gray} g`,
      'BT',
      `/${bold ? 'F2' : 'F1'} ${size} Tf`,
      `1 0 0 1 ${px.toFixed(2)} ${py.toFixed(2)} Tm`,
      `(${encodeText(str)}) Tj`,
      'ET',
      '0 g',
    );
  }

  /** Eine Linie. Beide `y` zählen von oben. */
  function line(x1, y1, x2, y2, { width = 0.7, gray = 0 } = {}) {
    if (!current) addPage();
    current.ops.push(
      `${gray} G`,
      `${width} w`,
      `${x1.toFixed(2)} ${(A4.height - y1).toFixed(2)} m`,
      `${x2.toFixed(2)} ${(A4.height - y2).toFixed(2)} l`,
      'S',
      '0 G',
    );
  }

  /** Ein Rechteck, nur Kontur. */
  function rect(x, y, w, hgt, { width = 0.7, gray = 0 } = {}) {
    if (!current) addPage();
    current.ops.push(
      `${gray} G`,
      `${width} w`,
      `${x.toFixed(2)} ${(A4.height - y - hgt).toFixed(2)} ${w.toFixed(2)} ${hgt.toFixed(2)} re`,
      'S',
      '0 G',
    );
  }

  /** Ein gefülltes Rechteck – für ruhige Hintergründe hinter Zahlen. */
  function fillRect(x, y, w, hgt, { gray = 0.92 } = {}) {
    if (!current) addPage();
    current.ops.push(
      `${gray} g`,
      `${x.toFixed(2)} ${(A4.height - y - hgt).toFixed(2)} ${w.toFixed(2)} ${hgt.toFixed(2)} re`,
      'f',
      '0 g',
    );
  }

  /**
   * Ein Streckenzug – für die Spur.
   *
   * Punkte kommen als `{ x, y }` mit `y` von oben, wie überall hier. Weniger
   * als zwei Punkte ergeben keine Linie und werden still übergangen: Eine
   * Spur aus einem einzigen Fix ist keine Spur.
   */
  function polyline(points, { width = 0.8, gray = 0 } = {}) {
    if (!current) addPage();
    const p = (points ?? []).filter((q) => Number.isFinite(q?.x) && Number.isFinite(q?.y));
    if (p.length < 2) return;
    const ops = [`${gray} G`, `${width} w`, '1 J', '1 j'];
    p.forEach((q, i) => {
      ops.push(`${q.x.toFixed(2)} ${(A4.height - q.y).toFixed(2)} ${i ? 'l' : 'm'}`);
    });
    ops.push('S', '0 G', '0 J', '0 j');
    current.ops.push(...ops);
  }

  /**
   * Ein gefüllter Punkt.
   *
   * PDF kennt keinen Kreis; vier Bézierbögen mit dem üblichen Faktor 0,5523
   * sind einer, den man von einem Kreis nicht unterscheidet.
   */
  function dot(x, y, r, { gray = 0 } = {}) {
    if (!current) addPage();
    const k = r * 0.5523;
    const cy = A4.height - y;
    const f = (n) => n.toFixed(2);
    current.ops.push(
      `${gray} g`,
      `${f(x - r)} ${f(cy)} m`,
      `${f(x - r)} ${f(cy + k)} ${f(x - k)} ${f(cy + r)} ${f(x)} ${f(cy + r)} c`,
      `${f(x + k)} ${f(cy + r)} ${f(x + r)} ${f(cy + k)} ${f(x + r)} ${f(cy)} c`,
      `${f(x + r)} ${f(cy - k)} ${f(x + k)} ${f(cy - r)} ${f(x)} ${f(cy - r)} c`,
      `${f(x - k)} ${f(cy - r)} ${f(x - r)} ${f(cy - k)} ${f(x - r)} ${f(cy)} c`,
      'f',
      '0 g',
    );
  }

  function build() {
    if (!pages.length) addPage();

    // Objekte der Reihe nach: Katalog, Seitenbaum, je Seite Seite + Inhalt,
    // dann die beiden Schriften.
    const objects = [];
    const add = (body) => { objects.push(body); return objects.length; };

    const catalogNr = add(null);      // wird unten gefüllt
    const pagesNr = add(null);
    const seiten = pages.map(() => ({ pageNr: add(null), contentNr: add(null) }));
    const fontNr = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const fontBoldNr = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const infoNr = add(`<< /Title (${encodeText(title)}) /Author (${encodeText(author)}) /Producer (Sailing Buddy) >>`);

    objects[catalogNr - 1] = `<< /Type /Catalog /Pages ${pagesNr} 0 R >>`;
    objects[pagesNr - 1] = `<< /Type /Pages /Kids [${seiten.map((s) => `${s.pageNr} 0 R`).join(' ')}] /Count ${seiten.length} >>`;

    seiten.forEach((s, i) => {
      const stream = pages[i].ops.join('\n');
      objects[s.pageNr - 1] = `<< /Type /Page /Parent ${pagesNr} 0 R `
        + `/MediaBox [0 0 ${A4.width.toFixed(2)} ${A4.height.toFixed(2)}] `
        + `/Resources << /Font << /F1 ${fontNr} 0 R /F2 ${fontBoldNr} 0 R >> >> `
        + `/Contents ${s.contentNr} 0 R >>`;
      objects[s.contentNr - 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    });

    // Alles als Zeichenkette mit je einem Byte je Zeichen aufbauen – dann ist
    // die Länge zugleich der Byteversatz, den die Querverweistabelle braucht.
    let out = '%PDF-1.4\n';
    // Vier Bytes über 127 im Kopf: So erkennen Programme die Datei als binär
    // und übertragen sie nicht zeilenweise umgeschrieben.
    out += `%${String.fromCharCode(0xe2, 0xe3, 0xcf, 0xd3)}\n`;
    const offsets = [];
    objects.forEach((body, i) => {
      offsets.push(out.length);
      out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });

    const xrefAt = out.length;
    out += `xref\n0 ${objects.length + 1}\n`;
    out += '0000000000 65535 f \n';
    offsets.forEach((off) => {
      out += `${String(off).padStart(10, '0')} 00000 n \n`;
    });
    out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogNr} 0 R /Info ${infoNr} 0 R >>\n`;
    out += `startxref\n${xrefAt}\n%%EOF\n`;

    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i += 1) bytes[i] = out.charCodeAt(i) & 0xff;
    return bytes;
  }

  return { addPage, text, line, rect, fillRect, polyline, dot, build };
}
