/**
 * Schallsignale nach den Kollisionsverhütungsregeln (KVR / COLREG), Regeln 32–35,
 * sowie Notsignale nach Anlage IV. Zweisprachig: Deutsch direkt, Englisch unter `en`.
 *
 * `pattern` beschreibt die Tonfolge für Anzeige und Wiedergabe:
 *   { k: 'short' }  – kurzer Ton, etwa 1 Sekunde
 *   { k: 'long' }   – langer Ton, 4 bis 6 Sekunden
 *   { k: 'bell' }   – einzelner Glockenschlag
 *   { k: 'ring' }   – Glocke etwa 5 Sekunden rasch geläutet
 *   { k: 'gong' }   – Gong achtern
 *   { k: 'pause' }  – Sprechpause zwischen Signalgruppen
 */

export const SOUND_BASICS = [
  { a: 'Kurzer Ton', b: '≈ 1 Sekunde', c: '●', en: { a: 'Short blast', b: '≈ 1 second' } },
  { a: 'Langer Ton', b: '4 bis 6 Sekunden', c: '▬', en: { a: 'Prolonged blast', b: '4 to 6 seconds' } },
  { a: 'Pflicht ab 12 m', b: 'Pfeife an Bord', c: '—', en: { a: 'Required from 12 m', b: 'a whistle on board' } },
  { a: 'Pflicht ab 20 m', b: 'Pfeife und Glocke', c: '—', en: { a: 'Required from 20 m', b: 'whistle and bell' } },
  { a: 'Pflicht ab 100 m', b: 'zusätzlich Gong achtern', c: '—', en: { a: 'Required from 100 m', b: 'a gong aft in addition' } },
  { a: 'Unter 12 m', b: 'irgendein wirksames Schallsignal genügt', c: '—', en: { a: 'Under 12 m', b: 'any efficient sound signal will do' } },
];

export const SOUNDS = [
  // ---- Regel 34: Manöver- und Warnsignale, in Sicht voneinander -------------
  {
    id: 'stb',
    group: 'manoever',
    title: 'Ich ändere meinen Kurs nach Steuerbord',
    pattern: [{ k: 'short' }],
    symbol: '●',
    rule: 'Regel 34 a',
    desc: 'Ein kurzer Ton. Wird beim Manöver gegeben, nicht davor angekündigt.',
    en: {
      title: 'I am altering my course to starboard',
      rule: 'Rule 34 a',
      desc: 'One short blast. Given while making the manoeuvre, not announced beforehand.',
    },
  },
  {
    id: 'bb',
    group: 'manoever',
    title: 'Ich ändere meinen Kurs nach Backbord',
    pattern: [{ k: 'short' }, { k: 'short' }],
    symbol: '● ●',
    rule: 'Regel 34 a',
    desc: 'Zwei kurze Töne.',
    en: { title: 'I am altering my course to port', rule: 'Rule 34 a', desc: 'Two short blasts.' },
  },
  {
    id: 'astern',
    group: 'manoever',
    title: 'Meine Maschine geht rückwärts',
    pattern: [{ k: 'short' }, { k: 'short' }, { k: 'short' }],
    symbol: '● ● ●',
    rule: 'Regel 34 a',
    desc: 'Drei kurze Töne. Bedeutet nicht zwangsläufig, dass das Fahrzeug rückwärts fährt – die Maschine arbeitet rückwärts.',
    en: {
      title: 'I am operating astern propulsion',
      rule: 'Rule 34 a',
      desc: 'Three short blasts. It does not necessarily mean the vessel is moving astern – the engine is going astern.',
    },
  },
  {
    id: 'doubt',
    group: 'manoever',
    title: 'Zweifels- und Warnsignal',
    pattern: [{ k: 'short' }, { k: 'short' }, { k: 'short' }, { k: 'short' }, { k: 'short' }],
    symbol: '● ● ● ● ●',
    rule: 'Regel 34 d',
    desc: 'Mindestens fünf kurze, rasch aufeinanderfolgende Töne: „Ich bezweifle, dass Sie ausreichende Maßnahmen zur Vermeidung eines Zusammenstoßes treffen.“ Im Zweifel selbst geben – und sofort handeln.',
    highlight: true,
    en: {
      title: 'Doubt and warning signal',
      rule: 'Rule 34 d',
      desc: 'At least five short and rapid blasts: “I doubt whether you are taking sufficient action to avoid collision.” If in doubt, sound it yourself – and act at once.',
    },
  },
  {
    id: 'overtake-stb',
    group: 'manoever',
    title: 'Ich will Sie an Steuerbord überholen',
    pattern: [{ k: 'long' }, { k: 'long' }, { k: 'short' }],
    symbol: '▬ ▬ ●',
    rule: 'Regel 34 c',
    desc: 'Nur in engen Fahrwassern und Fahrrinnen.',
    en: {
      title: 'I intend to overtake you on your starboard side',
      rule: 'Rule 34 c',
      desc: 'In narrow channels and fairways only.',
    },
  },
  {
    id: 'overtake-bb',
    group: 'manoever',
    title: 'Ich will Sie an Backbord überholen',
    pattern: [{ k: 'long' }, { k: 'long' }, { k: 'short' }, { k: 'short' }],
    symbol: '▬ ▬ ● ●',
    rule: 'Regel 34 c',
    desc: 'Nur in engen Fahrwassern und Fahrrinnen.',
    en: {
      title: 'I intend to overtake you on your port side',
      rule: 'Rule 34 c',
      desc: 'In narrow channels and fairways only.',
    },
  },
  {
    id: 'overtake-agree',
    group: 'manoever',
    title: 'Einverstanden – überholen Sie',
    pattern: [{ k: 'long' }, { k: 'short' }, { k: 'long' }, { k: 'short' }],
    symbol: '▬ ● ▬ ●',
    rule: 'Regel 34 c',
    desc: 'Antwort des überholten Fahrzeugs: lang – kurz – lang – kurz.',
    en: {
      title: 'Agreed – go ahead and overtake',
      rule: 'Rule 34 c',
      desc: 'The reply of the vessel being overtaken: prolonged – short – prolonged – short.',
    },
  },
  {
    id: 'bend',
    group: 'manoever',
    title: 'Achtungssignal vor einer unübersichtlichen Stelle',
    pattern: [{ k: 'long' }],
    symbol: '▬',
    rule: 'Regel 34 e',
    desc: 'Ein langer Ton vor einer Krümmung oder Sichtbehinderung. Wer ihn hört, antwortet mit einem langen Ton. Auch beim Ablegen aus einer Liegestelle.',
    en: {
      title: 'Warning at a bend or obstruction',
      rule: 'Rule 34 e',
      desc: 'One prolonged blast before a bend or an obstruction. Anyone who hears it answers with one prolonged blast. Also when leaving a berth.',
    },
  },

  // ---- Regel 35: Schallsignale bei verminderter Sicht -----------------------
  {
    id: 'fog-making-way',
    group: 'sicht',
    title: 'Maschinenfahrzeug mit Fahrt durchs Wasser',
    pattern: [{ k: 'long' }],
    symbol: '▬',
    interval: 'höchstens alle 2 Minuten',
    rule: 'Regel 35 a',
    desc: 'Ein langer Ton.',
    en: {
      title: 'Power-driven vessel making way through the water',
      interval: 'at intervals of not more than 2 minutes',
      rule: 'Rule 35 a',
      desc: 'One prolonged blast.',
    },
  },
  {
    id: 'fog-stopped',
    group: 'sicht',
    title: 'Maschinenfahrzeug in Fahrt, aber gestoppt',
    pattern: [{ k: 'long' }, { k: 'pause' }, { k: 'long' }],
    symbol: '▬  ▬',
    interval: 'höchstens alle 2 Minuten',
    rule: 'Regel 35 b',
    desc: 'Zwei lange Töne mit etwa 2 Sekunden Abstand. Keine Fahrt durchs Wasser, aber nicht verankert.',
    en: {
      title: 'Power-driven vessel under way but stopped',
      interval: 'at intervals of not more than 2 minutes',
      rule: 'Rule 35 b',
      desc: 'Two prolonged blasts about 2 seconds apart. Making no way through the water, but not anchored.',
    },
  },
  {
    id: 'fog-restricted',
    group: 'sicht',
    title: 'Segler, Fischer, Schlepper, manövrierbehindert …',
    pattern: [{ k: 'long' }, { k: 'short' }, { k: 'short' }],
    symbol: '▬ ● ●',
    interval: 'höchstens alle 2 Minuten',
    rule: 'Regel 35 c',
    desc: 'Ein langer und zwei kurze Töne. Gilt für: manövrierunfähige, manövrierbehinderte und tiefgangbehinderte Fahrzeuge, Segelfahrzeuge, fischende Fahrzeuge sowie schleppende oder schiebende Fahrzeuge.',
    highlight: true,
    en: {
      title: 'Sailing, fishing, towing, restricted in manoeuvring …',
      interval: 'at intervals of not more than 2 minutes',
      rule: 'Rule 35 c',
      desc: 'One prolonged followed by two short blasts. Applies to: vessels not under command, restricted in their ability to manoeuvre, constrained by draught, sailing vessels, vessels fishing, and vessels towing or pushing.',
    },
  },
  {
    id: 'fog-towed',
    group: 'sicht',
    title: 'Geschlepptes Fahrzeug (bemannt)',
    pattern: [{ k: 'long' }, { k: 'short' }, { k: 'short' }, { k: 'short' }],
    symbol: '▬ ● ● ●',
    interval: 'höchstens alle 2 Minuten',
    rule: 'Regel 35 e',
    desc: 'Ein langer und drei kurze Töne, möglichst unmittelbar nach dem Signal des Schleppers.',
    en: {
      title: 'Vessel being towed, if manned',
      interval: 'at intervals of not more than 2 minutes',
      rule: 'Rule 35 e',
      desc: 'One prolonged followed by three short blasts, where practicable immediately after the signal of the towing vessel.',
    },
  },
  {
    id: 'fog-anchor',
    group: 'sicht',
    title: 'Fahrzeug vor Anker',
    pattern: [{ k: 'ring' }],
    symbol: 'Glocke 5 s',
    interval: 'jede Minute',
    rule: 'Regel 35 g',
    desc: 'Die Glocke wird etwa 5 Sekunden lang rasch geläutet. Ab 100 m Länge zusätzlich ein Gong achtern. Zur Warnung eines sich nähernden Fahrzeugs darf zusätzlich kurz – lang – kurz gegeben werden.',
    en: {
      title: 'Vessel at anchor',
      symbol: 'bell 5 s',
      interval: 'every minute',
      rule: 'Rule 35 g',
      desc: 'The bell is rung rapidly for about 5 seconds. From 100 m in length, a gong aft in addition. To warn an approaching vessel she may also sound short – prolonged – short.',
    },
  },
  {
    id: 'fog-aground',
    group: 'sicht',
    title: 'Festgekommenes Fahrzeug',
    pattern: [{ k: 'bell' }, { k: 'bell' }, { k: 'bell' }, { k: 'ring' }, { k: 'bell' }, { k: 'bell' }, { k: 'bell' }],
    symbol: '3 Schläge · 5 s · 3 Schläge',
    interval: 'jede Minute',
    rule: 'Regel 35 h',
    desc: 'Drei deutliche Glockenschläge, dann 5 Sekunden rasches Läuten, dann wieder drei Schläge.',
    en: {
      title: 'Vessel aground',
      symbol: '3 strokes · 5 s · 3 strokes',
      interval: 'every minute',
      rule: 'Rule 35 h',
      desc: 'Three distinct strokes on the bell, then about 5 seconds of rapid ringing, then three distinct strokes again.',
    },
  },
  {
    id: 'fog-pilot',
    group: 'sicht',
    title: 'Lotsenfahrzeug im Dienst',
    pattern: [{ k: 'short' }, { k: 'short' }, { k: 'short' }, { k: 'short' }],
    symbol: '● ● ● ●',
    interval: 'zusätzlich zum eigenen Signal',
    rule: 'Regel 35 j',
    desc: 'Vier kurze Töne als Kennsignal, zusätzlich zum Signal für Fahrt oder Ankern.',
    en: {
      title: 'Pilot vessel on duty',
      interval: 'in addition to her own signal',
      rule: 'Rule 35 j',
      desc: 'Four short blasts as an identity signal, in addition to the signal for under way or at anchor.',
    },
  },
  {
    id: 'fog-small',
    group: 'sicht',
    title: 'Fahrzeug unter 12 m',
    pattern: [{ k: 'long' }],
    symbol: '▬ (beliebig)',
    interval: 'höchstens alle 2 Minuten',
    rule: 'Regel 35 i',
    desc: 'Muss die vorgeschriebenen Signale nicht geben, dann aber mindestens alle zwei Minuten ein anderes kräftiges Schallsignal. Nebelhorn, Pressluftfanfare oder notfalls kräftiges Rufen.',
    en: {
      title: 'Vessel under 12 m',
      interval: 'at intervals of not more than 2 minutes',
      rule: 'Rule 35 i',
      desc: 'Need not give the prescribed signals, but must then make some other efficient sound signal at least every two minutes. A foghorn, an aerosol horn, or at a pinch a good loud shout.',
    },
  },

  // ---- Anlage IV: Notsignale ------------------------------------------------
  {
    id: 'distress-sound',
    group: 'not',
    title: 'Notsignal mit Schallgerät',
    pattern: [{ k: 'long' }, { k: 'long' }, { k: 'long' }],
    symbol: '▬▬▬ ununterbrochen',
    rule: 'Anlage IV',
    desc: 'Ein ununterbrochener Ton mit einem beliebigen Schallgerät für Nebelsignale.',
    highlight: true,
    en: {
      title: 'Distress signal with a sound apparatus',
      rule: 'Annex IV',
      desc: 'A continuous sounding with any fog-signalling apparatus.',
    },
  },
  {
    id: 'distress-sos',
    group: 'not',
    title: 'SOS als Schall- oder Lichtsignal',
    pattern: [
      { k: 'short' }, { k: 'short' }, { k: 'short' }, { k: 'pause' },
      { k: 'long' }, { k: 'long' }, { k: 'long' }, { k: 'pause' },
      { k: 'short' }, { k: 'short' }, { k: 'short' },
    ],
    symbol: '● ● ●  ▬ ▬ ▬  ● ● ●',
    rule: 'Anlage IV',
    desc: 'Das Morsezeichen SOS – mit Schall, Licht oder Taschenlampe.',
    en: {
      title: 'SOS by sound or light',
      rule: 'Annex IV',
      desc: 'The Morse group SOS – by sound, by signal lamp or with a torch.',
    },
  },
];

/** Weitere Notsignale, die man sieht statt hört. */
export const DISTRESS_VISUAL = [
  { de: 'Rote Fallschirm-Leuchtrakete oder rote Handfackel', en: 'A red parachute flare or a red hand flare' },
  { de: 'Orangefarbenes Rauchsignal', en: 'An orange smoke signal' },
  { de: 'Langsames, wiederholtes Heben und Senken der seitlich ausgestreckten Arme', en: 'Slowly and repeatedly raising and lowering outstretched arms' },
  { de: 'Flaggensignal N über C', en: 'The flag signal November over Charlie' },
  { de: 'Viereckige Flagge mit Ball darüber oder darunter', en: 'A square flag with a ball above or below it' },
  { de: 'Orangefarbene Persenning mit schwarzem Quadrat und Kreis', en: 'An orange sheet with a black square and circle' },
  { de: 'Flammensignal an Bord, etwa ein brennendes Teerfass', en: 'Flames on the vessel, as from a burning tar barrel' },
  { de: 'Gesprochenes „MAYDAY“ im Sprechfunk', en: 'The spoken word “MAYDAY” by radiotelephony' },
  { de: 'DSC-Notalarm, EPIRB oder AIS-SART', en: 'A DSC distress alert, an EPIRB or an AIS-SART' },
  { de: 'Dauernd betätigte Nebelsignalanlage', en: 'Continuous sounding of the fog-signalling apparatus' },
];

export const SOUND_GROUPS = [
  {
    key: 'manoever',
    label: 'Manöver & Warnung',
    hint: 'In Sicht voneinander – KVR Regel 34',
    en: { label: 'Manoeuvring & warning', hint: 'In sight of one another – COLREG Rule 34' },
  },
  {
    key: 'sicht',
    label: 'Verminderte Sicht',
    hint: 'Nebel, Regen, Schneefall – KVR Regel 35',
    en: { label: 'Restricted visibility', hint: 'Fog, rain, falling snow – COLREG Rule 35' },
  },
  {
    key: 'not',
    label: 'Notsignale',
    hint: 'Anlage IV zur KVR',
    en: { label: 'Distress signals', hint: 'Annex IV to the COLREGs' },
  },
];

/** Dauer der Tonbausteine in Sekunden – für Anzeige und Wiedergabe. */
export const SOUND_DURATION = {
  short: 1.0,
  long: 5.0,
  bell: 0.6,
  ring: 5.0,
  gong: 1.2,
  pause: 1.5,
};
