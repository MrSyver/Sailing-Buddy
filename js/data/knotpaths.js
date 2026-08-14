/**
 * Der Verlauf der Leine je Knoten.
 *
 * Ein Abschnitt ist ein Stück Leine mit seinen Stützpunkten im Raster 0…100.
 * Zwei Ordnungen liegen darüber, und sie sind mit Absicht getrennt:
 *
 *   Die Reihenfolge im Feld ist die *Tiefe*. Was weiter vorn steht, liegt
 *   weiter hinten – der letzte Abschnitt liegt obenauf. Genau daran erkennt
 *   man einen Knoten: nicht am Schwung der Kurven, sondern daran, welcher
 *   Part über welchem liegt.
 *
 *   `n` ist die Reihenfolge *entlang der Leine* und bestimmt, ab welchem
 *   Schritt der Abschnitt da ist. So wächst dieselbe Zeichnung Schritt für
 *   Schritt mit, statt dass jeder Schritt ein eigenes Bild bräuchte.
 *
 * `end: 'werk'` setzt an das Ende einen Abschluss: Das ist das lose Ende und
 * kein Part, der hinter etwas verschwindet.
 *
 * Der Knoten selbst füllt das Bild; was nur dranhängt – ein langes Auge, ein
 * langer fester Part – läuft aus dem Rand heraus. Auf einem Telefon ist der
 * Platz die knappste Größe, und die Länge eines Auges muss niemand sehen.
 */

export const KNOT_DRAWINGS = {
  /**
   * Webleinstek am Rundholz: zwei Törns über Kreuz, das Ende unter den
   * zweiten gesteckt. Das Kreuz auf der Vorderseite ist das Erkennungszeichen –
   * daran sieht man auf einen Blick, ob es ein Webleinstek ist oder zwei
   * lose Schläge.
   */
  webleinstek: {
    steps: 4,
    props: [{ art: 'balken', x: -6, y: 36, w: 112, h: 24, rx: 4, n: 1 }],
    strands: [
      // Hinter der Spiere herum – liegt unter ihr.
      { n: 2, hinter: true, p: [[44, 33], [54, 27], [64, 33], [66, 48], [60, 63]] },
      { n: 3, hinter: true, p: [[34, 33], [24, 27], [14, 33], [12, 48], [18, 63]] },
      // Der feste Part kommt von unten links.
      { n: 1, p: [[10, 104], [16, 84], [22, 70], [26, 63]] },
      // Erster Törn über die Vorderseite.
      { n: 2, p: [[26, 63], [35, 48], [44, 33]] },
      // Das Ende, unter dem zweiten Törn hindurch – deshalb vor ihm gezeichnet.
      { n: 4, p: [[18, 63], [30, 58], [44, 55], [58, 56]], end: 'werk' },
      // Zweiter Törn über die Vorderseite, über den ersten hinweg.
      { n: 3, p: [[60, 63], [47, 48], [34, 33]] },
    ],
  },

  palstek: {
    steps: 4,
    strands: [
      // Hinter dem festen Part herum – deshalb ganz hinten.
      { n: 3, p: [[42, 17], [34, 9], [24, 11], [19, 20]] },
      // Der feste Part, von oben herunter in die Bucht.
      { n: 1, p: [[26, -6], [27, 8], [30, 22], [33, 34], [37, 46]] },
      // Von unten in die Bucht hinein: unter dem rechten Part hindurch.
      { n: 3, p: [[70, 63], [62, 57], [54, 49]] },
      // Und am Ende wieder hinaus: unter dem unteren Part hindurch.
      { n: 4, p: [[38, 46], [43, 58], [45, 73]], end: 'werk' },
      // Die Bucht: der feste Part legt sich über sich selbst.
      {
        n: 2,
        p: [[37, 46], [42, 58], [56, 63], [70, 55], [74, 39], [64, 26], [48, 23], [36, 29],
          [31, 39]],
      },
      // Das Auge – es läuft unten aus dem Bild.
      {
        n: 2,
        p: [[31, 39], [17, 56], [17, 80], [35, 95], [59, 96], [75, 84], [77, 70], [70, 63]],
      },
      // Oben aus der Bucht heraus – über den oberen Part.
      { n: 3, p: [[54, 49], [50, 35], [46, 24], [42, 17]] },
      // Und von der anderen Seite wieder hinein – über den linken Part.
      { n: 4, p: [[19, 20], [19, 32], [26, 41], [38, 46]] },
    ],
  },
};
