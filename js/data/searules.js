/**
 * Ausweichregeln – die Fahrregeln der KVR, als Lage von oben.
 *
 * Zweisprachig direkt im Objekt, wie bei den Knoten: Deutsch im Feld, Englisch
 * unter `…En`. Das hält den Regeltext bei der Regel, statt ihn über zwei
 * Wörterbücher zu verteilen.
 *
 * Jede Lage ist eine Draufsicht. Zwei Fahrzeuge, jedes mit Ort und Kurs in
 * Grad rechtweisend – 0 ist nach oben, 90 nach rechts. `weicht` sagt, welches
 * ausweichen muss; das andere hält Kurs und Fahrt bei. Genau diese beiden
 * Sätze sind die Regel; alles andere ist Erklärung.
 *
 * Bewusst keine Winkelgrade im Text, wo die Zeichnung sie zeigt: Wer auf See
 * eine Lage einschätzt, sieht Peilung und Bugseite, nicht Zahlen.
 *
 * Und eine Sache steht bei jeder Regel dabei, weil sie die wichtigste ist:
 * Ausweichpflicht heißt nicht, dass der andere nichts tut. Regel 17 verlangt
 * vom Kurshalter, selbst zu handeln, sobald erkennbar wird, dass der
 * Ausweichpflichtige nichts unternimmt. Ein Recht auf Vorfahrt gibt es auf
 * See nicht.
 */

/** Wonach man sucht, wenn man eine Lage vor sich hat. */
export const RULE_GROUPS = [
  { key: 'segel', label: 'Segelfahrzeuge untereinander', labelEn: 'Sailing vessels among themselves' },
  { key: 'maschine', label: 'Maschinenfahrzeuge untereinander', labelEn: 'Power-driven vessels among themselves' },
  { key: 'alle', label: 'Gilt für alle', labelEn: 'Applies to everyone' },
  { key: 'rang', label: 'Wer vor wem', labelEn: 'Who before whom' },
];

/**
 * `a` und `b` sind die beiden Fahrzeuge: `x`/`y` im Raster 0…100, `kurs` in
 * Grad, `art` bestimmt das Symbol ('segel' oder 'maschine').
 */
export const SEA_RULES = [
  {
    id: 'bug',
    group: 'segel',
    rule: 'Regel 12 a i',
    title: 'Verschiedener Bug: Backbordbug weicht aus',
    titleEn: 'Different tacks: port tack keeps clear',
    situation: 'Zwei Segelfahrzeuge, der Wind kommt bei jedem von einer anderen Seite.',
    situationEn: 'Two sailing vessels with the wind on different sides.',
    a: { x: 26, y: 74, kurs: 30, art: 'segel', name: 'Backbordbug' },
    b: { x: 74, y: 30, kurs: 215, art: 'segel', name: 'Steuerbordbug' },
    weicht: 'a',
    wind: 250,
    action: 'Wer den Wind von Backbord hat, weicht aus. Wer ihn von Steuerbord hat, hält Kurs und Fahrt bei.',
    actionEn: 'The vessel with the wind on the port side keeps out of the way. The one with it to starboard holds course and speed.',
    kurz: 'Steuerbord vor Backbord',
    kurzEn: 'Starboard before port',
    mnemonic: 'Steuerbordbug hat Vorrang – der Wind steht auf der Seite, die zählt.',
    mnemonicEn: 'Starboard tack has the right – the wind sits on the side that counts.',
  },
  {
    id: 'luv',
    group: 'segel',
    rule: 'Regel 12 a ii',
    title: 'Gleicher Bug: Luv weicht Lee aus',
    titleEn: 'Same tack: windward keeps clear of leeward',
    situation: 'Beide Segelfahrzeuge haben den Wind von derselben Seite.',
    situationEn: 'Both sailing vessels have the wind on the same side.',
    a: { x: 30, y: 30, kurs: 135, art: 'segel', name: 'in Luv' },
    b: { x: 62, y: 62, kurs: 135, art: 'segel', name: 'in Lee' },
    weicht: 'a',
    wind: 315,
    action: 'Das Fahrzeug in Luv – näher am Wind – weicht dem in Lee aus.',
    actionEn: 'The windward vessel – the one nearer the wind – keeps clear of the leeward one.',
    kurz: 'Luv weicht Lee',
    kurzEn: 'Windward gives way to leeward',
    mnemonic: 'Luv weicht Lee. Wer oben steht, geht aus dem Weg.',
    mnemonicEn: 'Windward gives way. Whoever is up there moves.',
  },
  {
    id: 'unklar',
    group: 'segel',
    rule: 'Regel 12 a iii',
    title: 'Bug nicht erkennbar: im Zweifel ausweichen',
    titleEn: 'Tack not clear: keep clear if in doubt',
    situation: 'Du hast den Wind von Backbord und siehst ein Fahrzeug in Luv, kannst aber nicht erkennen, auf welchem Bug es liegt.',
    situationEn: 'You have the wind to port and see a vessel to windward, but cannot make out its tack.',
    a: { x: 62, y: 66, kurs: 340, art: 'segel', name: 'du' },
    b: { x: 34, y: 26, kurs: 200, art: 'segel', name: 'nicht erkennbar' },
    weicht: 'a',
    wind: 250,
    action: 'Du weichst aus. Der Zweifel geht zu Lasten dessen, der ihn hat.',
    actionEn: 'You keep clear. The doubt is borne by the one who has it.',
    kurz: 'Im Zweifel ausweichen',
    kurzEn: 'When in doubt, keep clear',
    mnemonic: 'Wer nicht sicher ist, ist ausweichpflichtig.',
    mnemonicEn: 'Not sure means give way.',
  },
  {
    id: 'ueberholen',
    group: 'alle',
    rule: 'Regel 13',
    title: 'Überholen: der Überholende weicht aus',
    titleEn: 'Overtaking: the overtaking vessel keeps clear',
    situation: 'Du kommst mit mehr als 22,5° achterlicher als querab auf – du siehst nur das Hecklicht, keine Seitenlichter.',
    situationEn: 'You come up more than 22.5° abaft the beam – you see only the sternlight, no sidelights.',
    a: { x: 50, y: 80, kurs: 0, art: 'segel', name: 'überholt' },
    b: { x: 50, y: 34, kurs: 0, art: 'maschine', name: 'wird überholt' },
    weicht: 'a',
    action: 'Der Überholende weicht aus, bis er endgültig vorbei und frei ist. Diese Regel schlägt alle anderen: Auch ein Segelfahrzeug weicht einem Maschinenfahrzeug aus, wenn es überholt.',
    actionEn: 'The overtaking vessel keeps clear until finally past and clear. This rule beats all others: even a sailing vessel keeps clear of a power-driven one when overtaking.',
    kurz: 'Der Überholer weicht aus',
    kurzEn: 'The overtaker keeps clear',
    mnemonic: 'Wer von hinten kommt, geht außen herum. Ohne Ausnahme.',
    mnemonicEn: 'Whoever comes from behind goes around. No exception.',
  },
  {
    id: 'entgegen',
    group: 'maschine',
    rule: 'Regel 14',
    title: 'Entgegengesetzte Kurse: beide nach Steuerbord',
    titleEn: 'Head-on: both alter to starboard',
    situation: 'Zwei Maschinenfahrzeuge laufen genau oder fast genau aufeinander zu.',
    situationEn: 'Two power-driven vessels are meeting on reciprocal or nearly reciprocal courses.',
    a: { x: 44, y: 76, kurs: 0, art: 'maschine', name: 'du' },
    b: { x: 56, y: 26, kurs: 180, art: 'maschine', name: 'der andere' },
    weicht: 'beide',
    action: 'Beide gehen nach Steuerbord und passieren einander Backbord an Backbord. Keiner hält Kurs – hier weichen beide.',
    actionEn: 'Both alter course to starboard and pass port to port. Nobody stands on – here both give way.',
    kurz: 'Backbord an Backbord',
    kurzEn: 'Port to port',
    mnemonic: 'Rechts ausweichen wie auf der Straße, Backbord an Backbord vorbei.',
    mnemonicEn: 'Turn right as on the road, pass port to port.',
  },
  {
    id: 'kreuzend',
    group: 'maschine',
    rule: 'Regel 15',
    title: 'Kreuzende Kurse: Steuerbord hat Vorrang',
    titleEn: 'Crossing: starboard has the right',
    situation: 'Zwei Maschinenfahrzeuge kreuzen, sodass die Gefahr eines Zusammenstoßes besteht.',
    situationEn: 'Two power-driven vessels are crossing so as to involve risk of collision.',
    a: { x: 50, y: 76, kurs: 0, art: 'maschine', name: 'du' },
    b: { x: 76, y: 46, kurs: 270, art: 'maschine', name: 'an deiner Steuerbordseite' },
    weicht: 'a',
    action: 'Wer den anderen an seiner Steuerbordseite hat, weicht aus – und vermeidet dabei, vor dem Bug des anderen durchzugehen.',
    actionEn: 'The vessel which has the other on her starboard side keeps out of the way – and avoids crossing ahead of her.',
    kurz: 'Steuerbord vor Backbord',
    kurzEn: 'Starboard before port',
    mnemonic: 'Wer rechts kommt, hat Vorrang. Und niemals vor dem Bug durch.',
    mnemonicEn: 'Whoever comes from the right has the right. And never cross ahead.',
  },
  {
    id: 'segel-maschine',
    group: 'rang',
    rule: 'Regel 18',
    title: 'Maschine weicht Segel aus',
    titleEn: 'Power keeps clear of sail',
    situation: 'Ein Maschinenfahrzeug und ein Segelfahrzeug begegnen sich – keines der beiden überholt.',
    situationEn: 'A power-driven and a sailing vessel meet – neither is overtaking.',
    a: { x: 24, y: 50, kurs: 90, art: 'maschine', name: 'unter Maschine' },
    b: { x: 66, y: 62, kurs: 350, art: 'segel', name: 'unter Segel' },
    weicht: 'a',
    action: 'Das Maschinenfahrzeug weicht aus. Ein Segelfahrzeug mit laufender Maschine ist aber ein Maschinenfahrzeug – auch mit gesetzten Segeln.',
    actionEn: 'The power-driven vessel keeps clear. But a sailing vessel with her engine running is a power-driven vessel – even with sails up.',
    kurz: 'Maschine weicht Segel',
    kurzEn: 'Power gives way to sail',
    mnemonic: 'Motor aus heißt Segelfahrzeug. Motor an heißt Maschinenfahrzeug, Segel hin oder her.',
    mnemonicEn: 'Engine off means sailing vessel. Engine on means power-driven, sails or no sails.',
  },
  {
    id: 'fahrwasser',
    group: 'alle',
    rule: 'Regel 9',
    title: 'Enges Fahrwasser: rechts halten, Große nicht behindern',
    titleEn: 'Narrow channel: keep right, do not impede',
    situation: 'Ein enges Fahrwasser oder eine Fahrrinne, in der ein großes Fahrzeug fährt.',
    situationEn: 'A narrow channel or fairway with a large vessel in it.',
    a: { x: 34, y: 62, kurs: 0, art: 'segel', name: 'du' },
    b: { x: 58, y: 44, kurs: 180, art: 'maschine', name: 'Berufsschifffahrt' },
    weicht: 'a',
    fahrwasser: true,
    action: 'So weit nach Steuerbord halten, wie es sicher geht. Fahrzeuge unter 20 m und Segelfahrzeuge dürfen ein Fahrzeug, das nur innerhalb der Rinne sicher fahren kann, nicht behindern – das gilt zusätzlich zu allen Ausweichregeln.',
    actionEn: 'Keep as near to the starboard edge as is safe. Vessels under 20 m and sailing vessels must not impede a vessel that can safely navigate only within the channel – this applies on top of all steering rules.',
    kurz: 'Rechts halten, Große nicht behindern',
    kurzEn: 'Keep right, do not impede the big ones',
    mnemonic: 'Nicht behindern heißt: gar nicht erst in die Lage kommen, in der jemand ausweichen müsste.',
    mnemonicEn: 'Not impeding means never getting into the situation where anyone has to give way.',
  },
];

/**
 * Die Rangfolge aus Regel 18 – wer weicht wem aus.
 *
 * Von oben nach unten: Wer weiter oben steht, hält Kurs; wer weiter unten
 * steht, weicht aus. Das ist der Teil, den man an Deck nicht nachschlägt,
 * sondern kennt – und der einem trotzdem entfällt, wenn ein Baggerschiff im
 * Weg liegt.
 */
export const RULE_ORDER = [
  { label: 'Manövrierunfähig', labelEn: 'Not under command', hint: 'kann nicht ausweichen', hintEn: 'unable to keep clear' },
  { label: 'Manövrierbehindert', labelEn: 'Restricted in ability to manoeuvre', hint: 'Bagger, Kabelleger, Schleppverband', hintEn: 'dredger, cable layer, tow' },
  { label: 'Tiefgangbehindert', labelEn: 'Constrained by draught', hint: 'kommt nur in der Rinne durch', hintEn: 'can only pass in the channel' },
  { label: 'Beim Fischfang', labelEn: 'Engaged in fishing', hint: 'mit Netzen oder Leinen, die die Manövrierfähigkeit einschränken', hintEn: 'with gear that restricts manoeuvrability' },
  { label: 'Segelfahrzeug', labelEn: 'Sailing vessel', hint: 'ohne laufende Maschine', hintEn: 'engine not running' },
  { label: 'Maschinenfahrzeug', labelEn: 'Power-driven vessel', hint: 'weicht allen darüber aus', hintEn: 'keeps clear of all above' },
];

/**
 * Der Merksatz zur Rangfolge.
 *
 * Was man sich merkt, ist die Buchstabenfolge – M M T F S M. Sätze dazu gibt
 * es viele, und jede Schule hat ihren eigenen; deshalb steht hier die Folge
 * als das Feste und der Satz als das, was man austauschen kann.
 */
export const ORDER_MNEMONIC = {
  letters: 'M · M · T · F · S · M',
  sentence: 'Manche Männer trinken freitags schweren Muskateller.',
  sentenceEn: 'Many mariners take Friday shore leave merrily.',
  hint: 'Manövrierunfähig, Manövrierbehindert, Tiefgangbehindert, Fischerei, Segel, Maschine.',
  hintEn: 'Not under command, restricted in ability to manoeuvre, constrained by draught, fishing, sail, power.',
};
