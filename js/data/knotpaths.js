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
  palstek: {
    steps: 4,
    strands: [
      // Hinter dem festen Part herum – deshalb ganz hinten.
      { n: 3, p: [[39, 17], [30, 9], [18, 13], [15, 24]] },
      // Der feste Part, von oben herunter in die Bucht.
      { n: 1, p: [[15, -6], [19, 9], [24, 23], [29, 35], [34, 46]] },
      // Von unten in die Bucht hinein: unter dem rechten Part hindurch.
      { n: 3, p: [[67, 63], [59, 57], [51, 49]] },
      // Und am Ende wieder hinaus: unter dem unteren Part hindurch.
      { n: 4, p: [[41, 50], [45, 62], [47, 76]], end: 'werk' },
      // Die Bucht: der feste Part legt sich über sich selbst.
      {
        n: 2,
        p: [[34, 46], [39, 58], [53, 63], [67, 55], [71, 39], [61, 26], [45, 23], [33, 29],
          [28, 39]],
      },
      // Das Auge – es läuft unten aus dem Bild.
      {
        n: 2,
        p: [[28, 39], [14, 56], [14, 80], [32, 95], [56, 96], [72, 84], [74, 70], [67, 63]],
      },
      // Oben aus der Bucht heraus – über den oberen Part.
      { n: 3, p: [[51, 49], [47, 35], [43, 24], [39, 17]] },
      // Und von der anderen Seite wieder hinein – über den linken Part.
      { n: 4, p: [[15, 24], [14, 38], [21, 48], [33, 52], [41, 50]] },
    ],
  },
};
