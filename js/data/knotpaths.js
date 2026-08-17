/**
 * Der Verlauf der Leine je Knoten.
 *
 * Eine Leine ist ein durchgehender Zug von Stützpunkten im Raster 0…100 – vom
 * festen Part bis zum losen Ende, in der Reihenfolge, in der man sie in die
 * Hand nimmt. Die Rundung dazwischen rechnet der Code.
 *
 * Das einzige, was zusätzlich gesagt werden muss, ist `unter`: an welchen
 * Stellen die Leine unter etwas hindurchläuft. Angegeben wird die
 * Stützpunktnummer, auch krumm – 3.5 liegt zwischen dem vierten und fünften
 * Punkt. Dort bleibt eine Lücke, und der Part, der darüber läuft, füllt sie.
 *
 * Mehr braucht ein Knoten nicht, und weniger auch nicht: Welcher Part über
 * welchem liegt, ist die einzige Frage, die einen Knoten von einer gekringelten
 * Schnur unterscheidet. `tools/knotcheck.mjs` rechnet nach, ob jede Kreuzung
 * genau eine Unterführung hat und jede Unterführung ihre Kreuzung – eine Lücke
 * ohne Kreuzung ist im Bild nichts anderes als eine gerissene Leine.
 *
 * Der Knoten füllt das Bild; was nur dranhängt – ein langes Auge, ein langer
 * fester Part – läuft aus dem Rand heraus. Auf einem Telefon ist der Platz die
 * knappste Größe, und die Länge eines Auges muss niemand sehen.
 */

export const KNOT_DRAWINGS = {
  /**
   * Palstek: das Ende kommt von unten durch die Bucht, um den festen Part
   * herum und wieder zurück – „aus dem See, um den Baum, zurück in den See“.
   * Das Auge läuft unten aus dem Bild; wie groß es ist, gehört nicht zum
   * Knoten.
   */
  palstek: {
    lines: [{
      p: [
        // Der feste Part von oben herunter …
        [26, -6], [27, 8], [30, 22], [33, 34], [37, 46],
        // … legt sich als Bucht über sich selbst …
        [42, 58], [56, 63], [70, 55], [74, 39], [64, 26], [48, 23], [36, 29], [29, 43],
        // … und läuft als Auge unten aus dem Bild.
        [17, 58], [17, 80], [35, 95], [59, 96], [75, 84], [77, 70], [70, 63],
        // Von unten durch die Bucht …
        [62, 57], [54, 49],
        // … oben wieder heraus …
        [50, 35], [46, 24], [42, 17],
        // … hinter dem festen Part herum …
        [34, 9], [24, 11], [18, 20], [15, 38],
        // … und zurück durch die Bucht nach unten.
        [20, 54], [32, 50], [44, 50], [54, 58], [60, 80],
      ],
      unter: [3.01, 10.17, 19.62, 25.66, 28.93, 30.49, 32.25],
      ende: 'werk',
    }],
  },

  /**
   * Achtknoten: ein Auge legen, das Ende hinter dem festen Part herum und von
   * vorn wieder durch das Auge.
   *
   * Der Unterschied zum einfachen Überhandknoten steht genau in diesem einen
   * Wort „herum“: Der Achtknoten führt das Ende ganz um den festen Part, der
   * Überhandknoten nicht. Im Bild sind das vier Kreuzungen statt drei – und an
   * Deck ein Stopper, der dicker aufträgt und sich hinterher noch aufmachen
   * lässt.
   *
   * Über und Unter wechseln sich entlang der Leine lückenlos ab. Das ist keine
   * Zierde, sondern die Probe: Ein Achtknoten ist ein alternierender Knoten,
   * und wo die Folge stolpert, stimmt das Bild nicht.
   */
  achtknoten: {
    lines: [{
      p: [
        // Der feste Part von oben …
        [48, -8], [46, 8], [45, 22], [44, 36], [44, 50],
        // … legt sich als Auge über sich selbst …
        [58, 60], [70, 52], [71, 36], [60, 26], [46, 26], [34, 32],
        // … das Ende hinter dem festen Part herum …
        [30, 20], [42, 13], [58, 20],
        // … und von vorn wieder durch das Auge nach unten.
        [64, 34], [58, 48], [52, 60], [49, 76],
      ],
      unter: [2.32, 7.79, 12.23, 15.85],
      ende: 'werk',
    }],
  },

  /**
   * Kreuzknoten: zwei Buchten, die ineinandergreifen.
   *
   * Beide Leinen laufen waagerecht aus dem Bild, der Knoten sitzt in der Mitte.
   * Die beiden Kreuzungen wechseln sich ab – an der einen liegt die helle Leine
   * oben, an der anderen die dunkle. Genau das ist der Unterschied zum
   * Altweiberknoten, und genau das sagt der Merksatz: rechts über links, links
   * über rechts.
   */
  kreuzknoten: {
    lines: [
      {
        p: [[-8, 30], [14, 31], [34, 34], [50, 40], [60, 50], [52, 60], [36, 62], [22, 56],
          [8, 52]],
        unter: [5.09],
        ende: 'werk',
      },
      {
        leine: 2,
        p: [[108, 70], [86, 69], [66, 66], [50, 60], [40, 50], [48, 40], [64, 38], [78, 44],
          [92, 48]],
        unter: [5.09],
        ende: 'werk',
      },
    ],
  },

  /**
   * Webleinstek am Rundholz: zwei Törns über Kreuz, das Ende unter den zweiten
   * gesteckt. Das Kreuz auf der Vorderseite ist das Erkennungszeichen – daran
   * sieht man auf einen Blick, ob es ein Webleinstek ist oder zwei lose
   * Schläge.
   */
  webleinstek: {
    props: [{ art: 'balken', x: -6, y: 42, w: 112, h: 16, rx: 4 }],
    lines: [{
      p: [
        [19, 104], [25, 84], [31, 70], [35, 63],
        [44, 50], [53, 38],
        [63, 28], [75, 34], [77, 50], [69, 62],
        [56, 50], [43, 38],
        [33, 28], [21, 34], [19, 50], [27, 62],
        [35, 68], [51, 62], [67, 57], [81, 52],
      ],
      hinter: [[5, 9], [11, 15]],
      unter: [2.33, 4.54, 17.77],
      ende: 'werk',
    }],
  },
};
