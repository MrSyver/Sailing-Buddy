/**
 * Seezeichen nach dem IALA-Betonnungssystem, Region A (Europa, Afrika,
 * Australien, größter Teil Asiens). Zweisprachig: Deutsch direkt, Englisch
 * unter `en`.
 *
 * Wichtig: In Region B (Nord- und Südamerika, Japan, Korea, Philippinen)
 * sind die Farben der Lateralzeichen vertauscht – rot liegt dort beim
 * Einlaufen an Steuerbord. Kardinal-, Gefahren- und Sonderzeichen sind
 * in beiden Regionen gleich.
 *
 * `bands` beschreibt die Farbfolge von oben nach unten,
 * `topmark` das Toppzeichen, `lightColor` die Farbe des Feuers.
 *
 * `seen` und `traits` gehören zur Lichtersuche: Nachts sieht man von einer
 * Tonne nur das Feuer, also seine Farbe und seinen Rhythmus – nicht die
 * Farbbänder und nicht das Toppzeichen.
 */

export const BUOY_COLORS = {
  r: '#e02020',
  g: '#12a150',
  y: '#f2c200',
  b: '#111418',   // schwarz
  w: '#ffffff',
  bu: '#1263d2',  // blau
};

/**
 * Feuerkennungen als Zeitfolge, damit sie sich als Balken zeichnen lassen.
 * Jeder Abschnitt ist { d: Sekunden, c: Farbe } – ohne `c` ist es dunkel.
 * Die Summe ergibt die Wiederkehr.
 */
function fillTo(segments, period, color) {
  const used = segments.reduce((sum, seg) => sum + seg.d, 0);
  return { period, color, segments: [...segments, { d: Math.max(0.2, period - used) }] };
}

/** n Funkel, wahlweise mit anschließendem langem Blitz. */
function quick(n, period, color = 'w', longFlash = false) {
  const segments = [];
  for (let i = 0; i < n; i += 1) segments.push({ d: 0.35, c: color }, { d: 0.65 });
  if (longFlash) segments.push({ d: 2, c: color }, { d: 0.8 });
  return fillTo(segments, period, color);
}

/** n Blitze in einer Gruppe. */
function group(n, period, color, gap = 0.7, len = 0.45) {
  const segments = [];
  for (let i = 0; i < n; i += 1) segments.push({ d: len, c: color }, { d: gap });
  return fillTo(segments, period, color);
}

export const BUOYS = [
  // ---- Kardinalzeichen ------------------------------------------------------
  {
    id: 'card-n',
    rhythm: quick(9, 10, 'w'),
    seen: ['w'],
    traits: ['single', 'flash', 'quick'],
    group: 'kardinal',
    title: 'Nordzeichen',
    subtitle: 'Nördlich davon ist tiefes Wasser',
    bands: ['b', 'y'],
    topmark: 'cones-up',
    lightColor: 'w',
    light: 'Q  oder  VQ',
    lightPlain: 'Ununterbrochen funkelnd, weiß',
    meaning: 'Nördlich der Tonne vorbeifahren. Die Gefahr liegt südlich davon.',
    memo: 'Beide Kegelspitzen zeigen nach oben – nach Norden.',
    en: {
      title: 'North cardinal',
      subtitle: 'Deep water lies to the north',
      lightPlain: 'Continuous quick flashing, white',
      meaning: 'Pass to the north of the mark. The danger lies to the south of it.',
      memo: 'Both cones point up – to the north.',
    },
  },
  {
    id: 'card-e',
    rhythm: quick(3, 10, 'w'),
    seen: ['w'],
    traits: ['single', 'flash', 'quick', 'group'],
    group: 'kardinal',
    title: 'Ostzeichen',
    subtitle: 'Östlich davon ist tiefes Wasser',
    bands: ['b', 'y', 'b'],
    topmark: 'cones-base',
    lightColor: 'w',
    light: 'Q(3) 10s  oder  VQ(3) 5s',
    lightPlain: 'Drei Funkel, dann Pause, weiß',
    meaning: 'Östlich der Tonne vorbeifahren. Die Gefahr liegt westlich davon.',
    memo: 'Die Kegel stehen auf den Grundflächen – wie ein Ei, Ost.',
    en: {
      title: 'East cardinal',
      subtitle: 'Deep water lies to the east',
      lightPlain: 'Three quick flashes, then a pause, white',
      meaning: 'Pass to the east of the mark. The danger lies to the west of it.',
      memo: 'Cones base to base – like an egg, East. Three flashes, like the 3 on a clock face.',
    },
  },
  {
    id: 'card-s',
    rhythm: quick(6, 15, 'w', true),
    seen: ['w'],
    traits: ['single', 'flash', 'quick', 'group', 'longflash'],
    group: 'kardinal',
    title: 'Südzeichen',
    subtitle: 'Südlich davon ist tiefes Wasser',
    bands: ['y', 'b'],
    topmark: 'cones-down',
    lightColor: 'w',
    light: 'Q(6) + LFl 15s  oder  VQ(6) + LFl 10s',
    lightPlain: 'Sechs Funkel und ein langer Blitz, weiß',
    meaning: 'Südlich der Tonne vorbeifahren. Die Gefahr liegt nördlich davon.',
    memo: 'Beide Kegelspitzen zeigen nach unten – nach Süden. Der lange Blitz bestätigt die sechs.',
    en: {
      title: 'South cardinal',
      subtitle: 'Deep water lies to the south',
      lightPlain: 'Six quick flashes and one long flash, white',
      meaning: 'Pass to the south of the mark. The danger lies to the north of it.',
      memo: 'Both cones point down – to the south. The long flash confirms you counted six.',
    },
  },
  {
    id: 'card-w',
    rhythm: quick(9, 15, 'w'),
    seen: ['w'],
    traits: ['single', 'flash', 'quick', 'group'],
    group: 'kardinal',
    title: 'Westzeichen',
    subtitle: 'Westlich davon ist tiefes Wasser',
    bands: ['y', 'b', 'y'],
    topmark: 'cones-point',
    lightColor: 'w',
    light: 'Q(9) 15s  oder  VQ(9) 10s',
    lightPlain: 'Neun Funkel, dann Pause, weiß',
    meaning: 'Westlich der Tonne vorbeifahren. Die Gefahr liegt östlich davon.',
    memo: 'Die Kegelspitzen zeigen zueinander – wie ein Weinglas, West. Neun wie die 9 auf dem Zifferblatt.',
    en: {
      title: 'West cardinal',
      subtitle: 'Deep water lies to the west',
      lightPlain: 'Nine quick flashes, then a pause, white',
      meaning: 'Pass to the west of the mark. The danger lies to the east of it.',
      memo: 'Cones point to point – like a wine glass, West. Nine, like the 9 on a clock face.',
    },
  },

  // ---- Lateralzeichen -------------------------------------------------------
  {
    id: 'lat-port',
    rhythmIsExample: true,
    rhythm: group(1, 4, 'r'),
    seen: ['r'],
    traits: ['single', 'flash'],
    group: 'lateral',
    title: 'Backbordzeichen',
    subtitle: 'Region A – beim Einlaufen an Backbord lassen',
    bands: ['r'],
    topmark: 'cylinder',
    topmarkColor: 'r',
    lightColor: 'r',
    light: 'jede rote Kennung, oft Fl R oder Fl(2) R',
    lightPlain: 'Rotes Feuer, Rhythmus beliebig',
    meaning: 'Beim Einlaufen (von See kommend) an Backbord lassen. Stumpfes Oberzeichen, Zylinder.',
    memo: 'Rot, Zylinder, stumpf – wie das rote Backbord-Seitenlicht.',
    en: {
      title: 'Port hand mark',
      subtitle: 'Region A – leave to port when entering',
      light: 'any red rhythm, often Fl R or Fl(2) R',
      lightPlain: 'Red light, any rhythm',
      meaning: 'Leave to port when entering from seaward. Blunt topmark, a cylinder (can).',
      memo: 'Red, can-shaped, blunt – like the red port sidelight.',
    },
  },
  {
    id: 'lat-stbd',
    rhythmIsExample: true,
    rhythm: group(1, 4, 'g'),
    seen: ['g'],
    traits: ['single', 'flash'],
    group: 'lateral',
    title: 'Steuerbordzeichen',
    subtitle: 'Region A – beim Einlaufen an Steuerbord lassen',
    bands: ['g'],
    topmark: 'cone',
    topmarkColor: 'g',
    lightColor: 'g',
    light: 'jede grüne Kennung, oft Fl G oder Fl(2) G',
    lightPlain: 'Grünes Feuer, Rhythmus beliebig',
    meaning: 'Beim Einlaufen (von See kommend) an Steuerbord lassen. Spitzes Oberzeichen, Kegel.',
    memo: 'Grün, Kegel, spitz – wie das grüne Steuerbord-Seitenlicht.',
    en: {
      title: 'Starboard hand mark',
      subtitle: 'Region A – leave to starboard when entering',
      light: 'any green rhythm, often Fl G or Fl(2) G',
      lightPlain: 'Green light, any rhythm',
      meaning: 'Leave to starboard when entering from seaward. Pointed topmark, a cone.',
      memo: 'Green, cone-shaped, pointed – like the green starboard sidelight.',
    },
  },
  {
    id: 'lat-pref-stbd',
    rhythm: fillTo([{ d: 0.45, c: 'r' }, { d: 0.7 }, { d: 0.45, c: 'r' }, { d: 1.6 }, { d: 0.45, c: 'r' }], 10, 'r'),
    seen: ['r'],
    traits: ['single', 'flash', 'group'],
    group: 'lateral',
    title: 'Hauptfahrwasser rechts',
    subtitle: 'Backbordzeichen mit grünem Band',
    bands: ['r', 'g', 'r'],
    topmark: 'cylinder',
    topmarkColor: 'r',
    lightColor: 'r',
    light: 'Fl(2+1) R',
    lightPlain: 'Zwei rote Blitze, dann ein einzelner',
    meaning: 'Das Fahrwasser teilt sich. Das Hauptfahrwasser liegt rechts – Tonne an Backbord lassen.',
    en: {
      title: 'Preferred channel to starboard',
      subtitle: 'Port hand mark with a green band',
      lightPlain: 'Two red flashes, then a single one',
      meaning: 'The channel divides. The main channel is to starboard – leave this mark to port.',
    },
  },
  {
    id: 'lat-pref-port',
    rhythm: fillTo([{ d: 0.45, c: 'g' }, { d: 0.7 }, { d: 0.45, c: 'g' }, { d: 1.6 }, { d: 0.45, c: 'g' }], 10, 'g'),
    seen: ['g'],
    traits: ['single', 'flash', 'group'],
    group: 'lateral',
    title: 'Hauptfahrwasser links',
    subtitle: 'Steuerbordzeichen mit rotem Band',
    bands: ['g', 'r', 'g'],
    topmark: 'cone',
    topmarkColor: 'g',
    lightColor: 'g',
    light: 'Fl(2+1) G',
    lightPlain: 'Zwei grüne Blitze, dann ein einzelner',
    meaning: 'Das Fahrwasser teilt sich. Das Hauptfahrwasser liegt links – Tonne an Steuerbord lassen.',
    en: {
      title: 'Preferred channel to port',
      subtitle: 'Starboard hand mark with a red band',
      lightPlain: 'Two green flashes, then a single one',
      meaning: 'The channel divides. The main channel is to port – leave this mark to starboard.',
    },
  },

  // ---- Gefahren- und Sonderzeichen -----------------------------------------
  {
    id: 'isolated',
    rhythm: group(2, 5, 'w'),
    seen: ['w'],
    traits: ['single', 'flash', 'group'],
    group: 'gefahr',
    title: 'Einzelgefahrenstelle',
    subtitle: 'Untiefe oder Wrack mit freiem Wasser ringsum',
    bands: ['b', 'r', 'b'],
    topmark: 'balls2',
    topmarkColor: 'b',
    lightColor: 'w',
    light: 'Fl(2) 5s',
    lightPlain: 'Zwei weiße Blitze in der Gruppe',
    meaning: 'Steht direkt über einer einzelnen Gefahr. Ringsum ist schiffbares Wasser – aber Abstand halten.',
    memo: 'Zwei schwarze Bälle, zwei Blitze – die Gefahr steht darunter.',
    en: {
      title: 'Isolated danger mark',
      subtitle: 'A shoal or wreck with navigable water all round',
      lightPlain: 'Two white flashes in a group',
      meaning: 'Moored directly on a single danger. There is navigable water all round – but keep clear.',
      memo: 'Two black balls, two flashes – the danger is right underneath.',
    },
  },
  {
    id: 'safewater',
    rhythm: fillTo([{ d: 2, c: 'w' }], 10, 'w'),
    seen: ['w'],
    traits: ['single', 'steady', 'longflash'],
    group: 'gefahr',
    title: 'Mittefahrwasserzeichen',
    subtitle: 'Sicheres Fahrwasser, ringsum schiffbar',
    bands: ['r', 'w', 'r', 'w'],
    stripes: true,
    topmark: 'sphere',
    topmarkColor: 'r',
    lightColor: 'w',
    light: 'Iso, Oc, LFl 10s  oder  Mo(A)',
    lightPlain: 'Weißes Feuer: gleichtaktig, unterbrochen, ein langer Blitz oder Morse A',
    meaning: 'Ansteuerungstonne oder Fahrwassermitte. Ringsum ist schiffbares Wasser, die Tonne darf beidseitig passiert werden.',
    memo: 'Rot-weiß senkrecht gestreift, roter Ball – hier ist alles frei.',
    en: {
      title: 'Safe water mark',
      subtitle: 'Navigable water all round',
      light: 'Iso, Oc, LFl 10s or Mo(A)',
      lightPlain: 'White light: isophase, occulting, one long flash or Morse A',
      meaning: 'Landfall or mid-channel mark. Navigable water all round – it may be passed on either side.',
      memo: 'Red and white vertical stripes, red sphere – everything here is clear.',
    },
  },
  {
    id: 'special',
    rhythm: group(1, 5, 'y'),
    seen: ['y'],
    traits: ['single', 'flash'],
    group: 'gefahr',
    title: 'Sonderzeichen',
    subtitle: 'Sperrgebiet, Kabel, Messstelle, Badezone',
    bands: ['y'],
    topmark: 'cross-x',
    topmarkColor: 'y',
    lightColor: 'y',
    light: 'Fl Y  (jede gelbe Kennung)',
    lightPlain: 'Gelbes Feuer, Rhythmus beliebig',
    meaning: 'Kennzeichnet keine Gefahr für die Navigation, sondern ein besonderes Gebiet – was genau, steht in der Seekarte.',
    en: {
      title: 'Special mark',
      subtitle: 'Restricted area, cable, measuring station, bathing zone',
      light: 'Fl Y (any yellow rhythm)',
      lightPlain: 'Yellow light, any rhythm',
      meaning: 'Marks no navigational danger but a special area – what exactly is on the chart.',
    },
  },
  {
    id: 'wreck',
    rhythm: fillTo([{ d: 1, c: 'bu' }, { d: 0.5 }, { d: 1, c: 'y' }], 3, 'bu'),
    seen: ['bu', 'y'],
    traits: ['single', 'flash', 'alternating'],
    group: 'gefahr',
    title: 'Notfall-Wrackzeichen',
    subtitle: 'Frisches Wrack, noch nicht in der Karte',
    bands: ['bu', 'y', 'bu', 'y'],
    stripes: true,
    topmark: 'cross-upright',
    topmarkColor: 'y',
    lightColor: 'buy',
    light: 'Al Bu Y 3s',
    lightPlain: 'Abwechselnd blau und gelb, je 1 Sekunde',
    meaning: 'Steht über einem neu entdeckten Wrack, bis die übliche Betonnung liegt und die Karte berichtigt ist. Weiträumig ausweichen.',
    memo: 'Blau-gelb ist sonst nirgends im System – wer das sieht, hält sich fern.',
    en: {
      title: 'Emergency wreck marking buoy',
      subtitle: 'A new wreck, not yet on the chart',
      lightPlain: 'Alternating blue and yellow, one second each',
      meaning: 'Placed over a newly discovered wreck until normal marking is laid and the chart corrected. Give it a wide berth.',
      memo: 'Blue and yellow appear nowhere else in the system – if you see it, stay well clear.',
    },
  },
];

export const BUOY_GROUPS = [
  {
    key: 'kardinal',
    label: 'Kardinalzeichen',
    hint: 'Zeigen, auf welcher Seite das tiefe Wasser liegt. Immer schwarz-gelb, immer weißes Funkelfeuer.',
    en: {
      label: 'Cardinal marks',
      hint: 'They tell you on which side the deep water lies. Always black and yellow, always a white quick-flashing light.',
    },
  },
  {
    key: 'lateral',
    label: 'Lateralzeichen',
    hint: 'Begrenzen das Fahrwasser. In Region A (Europa) rot an Backbord beim Einlaufen – in Region B ist es umgekehrt.',
    en: {
      label: 'Lateral marks',
      hint: 'They mark the sides of the channel. In Region A (Europe) red to port when entering – in Region B it is the other way round.',
    },
  },
  {
    key: 'gefahr',
    label: 'Gefahren- und Sonderzeichen',
    hint: 'Einzelne Gefahren, sicheres Wasser und alles, was sonst noch bezeichnet wird.',
    en: {
      label: 'Danger and special marks',
      hint: 'Single dangers, safe water, and everything else that gets marked.',
    },
  },
];

/** Abkürzungen der Feuerkennungen, wie sie in der Seekarte stehen. */
export const LIGHT_RHYTHMS = [
  { abbr: 'F', de: 'Festfeuer – brennt ununterbrochen', en: 'Fixed – burns continuously' },
  { abbr: 'Fl', de: 'Blitzfeuer – kurz hell, lange dunkel', en: 'Flashing – short light, longer darkness' },
  { abbr: 'LFl', de: 'Blinkfeuer – Blitz von mindestens 2 Sekunden', en: 'Long flashing – a flash of 2 seconds or more' },
  { abbr: 'Oc', de: 'Unterbrochenes Feuer – lange hell, kurz dunkel', en: 'Occulting – longer light, short darkness' },
  { abbr: 'Iso', de: 'Gleichtaktfeuer – hell und dunkel gleich lang', en: 'Isophase – equal light and darkness' },
  { abbr: 'Q', de: 'Funkelfeuer – etwa 50 bis 79 Blitze je Minute', en: 'Quick – about 50 to 79 flashes per minute' },
  { abbr: 'VQ', de: 'Schnelles Funkelfeuer – etwa 80 bis 159 je Minute', en: 'Very quick – about 80 to 159 per minute' },
  { abbr: 'Mo(A)', de: 'Morsefeuer – hier der Buchstabe A: kurz, lang', en: 'Morse – here the letter A: short, long' },
  { abbr: 'Al', de: 'Wechselfeuer – wechselt die Farbe', en: 'Alternating – changes colour' },
  { abbr: '(3) 10s', de: 'Gruppe aus 3 Blitzen, Wiederkehr alle 10 Sekunden', en: 'A group of 3 flashes, repeating every 10 seconds' },
];

/** Farbkürzel in der Seekarte. */
export const LIGHT_COLOR_CODES = [
  { abbr: 'W', de: 'weiß', en: 'white' },
  { abbr: 'R', de: 'rot', en: 'red' },
  { abbr: 'G', de: 'grün', en: 'green' },
  { abbr: 'Y', de: 'gelb', en: 'yellow' },
  { abbr: 'Bu', de: 'blau', en: 'blue' },
];
