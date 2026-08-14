/**
 * Signalkörper und Flaggen bei Tage – KVR (COLREG) Regeln 24 bis 30 sowie
 * Anlage IV. Zweisprachig: Deutsch direkt im Objekt, Englisch unter `en`.
 *
 * Bei Tage sagen keine Lichter, was ein Fahrzeug tut, sondern schwarze
 * Signalkörper an einer Stelle, an der man sie am besten sieht. Es sind nur
 * fünf Formen, und aus ihnen setzt sich alles zusammen:
 *
 *   ball      Ball        – vor Anker, manövrierunfähig, auf Grund
 *   cone      Kegel       – Spitze unten: Maschinenfahrt unter Segeln
 *                           Spitze oben: Fanggeschirr weiter als 150 m
 *   biconic   Doppelkegel – zwei Kegel, Spitzen zusammen: Fischerei
 *   cylinder  Zylinder    – durch den Tiefgang behindert
 *   diamond   Rhombus     – Schleppanhang über 200 m, oder als Teil von
 *                           Ball–Rhombus–Ball beim manövrierbehinderten
 *                           Fahrzeug
 *
 * `shapes` beschreibt, was an welcher Höhe hängt: `y` ist die Höhe im
 * 100 × 100 großen Feld (0 = oben am Mast, 100 = Deck), genau wie bei den
 * Laternen. So lassen sich Tag- und Nachtansicht nebeneinander lesen.
 *
 * `id` stimmt mit dem Fahrzeug in `lights.js` überein, wo es eines gibt – dann
 * sind es zwei Ansichten derselben Sache und nicht zwei Datensätze.
 *
 * Die Größen der Körper stehen in Anlage I Nr. 6: Ball mindestens 0,6 m
 * Durchmesser, Kegel gleicher Durchmesser und gleiche Höhe, Zylinder
 * Durchmesser 0,6 m und doppelt so hoch, Rhombus zwei Kegel an der Grundfläche.
 * Auf Fahrzeugen unter 20 m dürfen sie kleiner sein.
 */

/** Die Formen, aus denen sich alles zusammensetzt. */
export const SHAPE_KINDS = [
  {
    key: 'ball', label: 'Ball', labelEn: 'Ball',
    hint: 'Vor Anker, manövrierunfähig, auf Grund',
    hintEn: 'At anchor, not under command, aground',
  },
  {
    key: 'cone-down', label: 'Kegel, Spitze unten', labelEn: 'Cone, point down',
    hint: 'Segelfahrzeug, das zugleich unter Maschine fährt',
    hintEn: 'A sailing vessel also proceeding under power',
  },
  {
    key: 'cone-up', label: 'Kegel, Spitze oben', labelEn: 'Cone, point up',
    hint: 'Fanggeschirr reicht weiter als 150 m in diese Richtung',
    hintEn: 'Fishing gear extending more than 150 m in that direction',
  },
  {
    key: 'biconic', label: 'Doppelkegel', labelEn: 'Two cones, points together',
    hint: 'Fahrzeug beim Fischfang',
    hintEn: 'A vessel engaged in fishing',
  },
  {
    key: 'cylinder', label: 'Zylinder', labelEn: 'Cylinder',
    hint: 'Durch den Tiefgang behindert',
    hintEn: 'Constrained by her draught',
  },
  {
    key: 'diamond', label: 'Rhombus', labelEn: 'Diamond',
    hint: 'Schleppanhang über 200 m, oder Teil des Zeichens für manövrierbehindert',
    hintEn: 'Tow longer than 200 m, or part of the restricted-in-ability signal',
  },
];

/** Gruppen für die Filterleiste – dieselben wie bei den Laternen. */
export const DAY_CATEGORIES = [
  { key: 'all', label: 'Alle', labelEn: 'All' },
  { key: 'fahrt', label: 'In Fahrt', labelEn: 'Under way' },
  { key: 'behindert', label: 'Behindert', labelEn: 'Restricted' },
  { key: 'arbeit', label: 'Bei der Arbeit', labelEn: 'Working' },
  { key: 'liegend', label: 'Liegend', labelEn: 'Stopped' },
];

/**
 * Merkmale zum Suchen: Man sieht eine Form und zählt, wie viele es sind.
 * Genau danach wird gesucht – nicht nach dem Namen des Fahrzeugs, denn den
 * kennt man ja gerade nicht.
 */
export const DAY_FACETS = [
  // Bei Tage ist die Farbe das Erste, was man sieht – lange bevor man eine
  // Form erkennt. Signalkörper sind immer schwarz, Tonnen und Tafeln nicht.
  { key: 'r', kind: 'color', label: 'Rot', labelEn: 'Red' },
  { key: 'g', kind: 'color', label: 'Grün', labelEn: 'Green' },
  { key: 'y', kind: 'color', label: 'Gelb', labelEn: 'Yellow' },
  { key: 'b', kind: 'color', label: 'Schwarz', labelEn: 'Black' },
  { key: 'w', kind: 'color', label: 'Weiß', labelEn: 'White' },
  { key: 'bu', kind: 'color', label: 'Blau', labelEn: 'Blue' },
  { key: 'ball', kind: 'shape', label: 'Ball', labelEn: 'Ball' },
  { key: 'cone', kind: 'shape', label: 'Kegel', labelEn: 'Cone' },
  { key: 'biconic', kind: 'shape', label: 'Doppelkegel', labelEn: 'Two cones' },
  { key: 'cylinder', kind: 'shape', label: 'Zylinder', labelEn: 'Cylinder' },
  { key: 'diamond', kind: 'shape', label: 'Rhombus', labelEn: 'Diamond' },
  { key: 'one', kind: 'count', label: 'Ein Körper', labelEn: 'One shape' },
  { key: 'two', kind: 'count', label: 'Zwei Körper', labelEn: 'Two shapes' },
  { key: 'three', kind: 'count', label: 'Drei Körper', labelEn: 'Three shapes' },
  { key: 'vertical', kind: 'form', label: 'Senkrecht übereinander', labelEn: 'In a vertical line' },
  { key: 'forward', kind: 'form', label: 'Vorn im Schiff', labelEn: 'In the fore part' },
];

export const DAY_FACET_GROUPS = [
  { kind: 'color', label: 'Welche Farbe?', labelEn: 'Which colour?' },
  { kind: 'shape', label: 'Welche Form?', labelEn: 'Which shape?' },
  { kind: 'count', label: 'Wie viele?', labelEn: 'How many?' },
  { kind: 'form', label: 'Wie angeordnet?', labelEn: 'How arranged?' },
];

export const DAY_SHAPES = [
  {
    id: 'sail-under-power',
    category: 'fahrt',
    shapes: [{ k: 'cone-down', y: 34 }],
    traits: ['b', 'cone', 'one', 'forward'],
    title: 'Segelfahrzeug unter Maschine',
    subtitle: 'Segel gesetzt und Maschine läuft',
    rule: 'Regel 25 (5)',
    pattern: 'Ein schwarzer Kegel, Spitze nach unten, vorn im Schiff',
    signs: [
      'Ein Kegel mit der Spitze nach unten, so weit vorn wie möglich',
      'Er gilt, sobald die Maschine mitläuft – auch wenn die Segel noch stehen',
      'Unter 12 m Länge ist er nicht vorgeschrieben, aber sinnvoll',
    ],
    note: 'Der wichtigste und der am häufigsten vergessene Signalkörper an Bord einer Yacht. Ohne ihn hältst du dich für ein Segelfahrzeug – und die anderen halten dich auch dafür, obwohl du längst ein Maschinenfahrzeug bist und ausweichpflichtig wärst.',
    en: {
      title: 'Sailing vessel under power',
      subtitle: 'Sails set and engine running',
      rule: 'Rule 25(e)',
      pattern: 'One black cone, point down, in the fore part',
      signs: [
        'A cone with its point downwards, as far forward as possible',
        'It applies the moment the engine is running – even with the sails still set',
        'Not required under 12 m, but sensible all the same',
      ],
      note: 'The most important day shape on a yacht, and the one most often forgotten. Without it you take yourself for a sailing vessel – and so does everyone else, though you have long since become a power-driven vessel with the duty to give way.',
    },
  },
  {
    id: 'anchor',
    category: 'liegend',
    shapes: [{ k: 'ball', y: 30 }],
    traits: ['b', 'ball', 'one', 'forward'],
    title: 'Fahrzeug vor Anker',
    subtitle: 'Ankerball',
    rule: 'Regel 30 (1)',
    pattern: 'Ein schwarzer Ball, vorn im Schiff',
    signs: [
      'Ein Ball im Vorschiff, dort wo er am besten zu sehen ist',
      'Unter 7 m Länge nicht vorgeschrieben, sofern nicht in oder nahe einer Fahrrinne oder Reede geankert wird',
    ],
    note: 'Er sagt nicht nur „ich liege“, sondern auch: Ich schwoje um meinen Anker und kann dir nicht ausweichen. In einer belebten Ankerbucht ist er die Antwort auf die Frage, ob dort noch Platz ist.',
    en: {
      title: 'Vessel at anchor',
      subtitle: 'Anchor ball',
      rule: 'Rule 30(a)',
      pattern: 'One black ball, in the fore part',
      signs: [
        'A ball in the fore part, where it is best seen',
        'Not required under 7 m unless anchored in or near a narrow channel, fairway or anchorage',
      ],
      note: 'It says more than “I am lying here”: it says I am swinging to my anchor and cannot get out of your way. In a busy anchorage it answers the question of whether there is still room.',
    },
  },
  {
    id: 'aground',
    category: 'liegend',
    shapes: [{ k: 'ball', y: 16 }, { k: 'ball', y: 38 }, { k: 'ball', y: 60 }],
    traits: ['b', 'ball', 'three', 'vertical'],
    title: 'Fahrzeug auf Grund',
    subtitle: 'Festgekommen',
    rule: 'Regel 30 (4)',
    pattern: 'Drei schwarze Bälle senkrecht übereinander',
    signs: [
      'Drei Bälle senkrecht übereinander, dort wo sie am besten zu sehen sind',
      'Zusätzlich gelten die Ankerzeichen',
      'Unter 12 m Länge nicht vorgeschrieben',
    ],
    note: 'Drei Bälle heißen: Hier ist es flacher, als deine Karte sagt. Wer sie sieht, hält Abstand – und ruft.',
    en: {
      title: 'Vessel aground',
      subtitle: 'Hard and fast',
      rule: 'Rule 30(d)',
      pattern: 'Three black balls in a vertical line',
      signs: [
        'Three balls in a vertical line where they are best seen',
        'The anchor signals apply as well',
        'Not required under 12 m',
      ],
      note: 'Three balls mean: it is shallower here than your chart says. Whoever sees them keeps clear – and calls.',
    },
  },
  {
    id: 'nuc',
    category: 'behindert',
    shapes: [{ k: 'ball', y: 24 }, { k: 'ball', y: 48 }],
    traits: ['b', 'ball', 'two', 'vertical'],
    title: 'Manövrierunfähiges Fahrzeug',
    subtitle: 'Ruder- oder Maschinenschaden',
    rule: 'Regel 27 (1)',
    pattern: 'Zwei schwarze Bälle senkrecht übereinander',
    signs: [
      'Zwei Bälle senkrecht übereinander, dort wo sie am besten zu sehen sind',
      'Macht das Fahrzeug Fahrt durchs Wasser, gelten zusätzlich die Zeichen für ein Fahrzeug in Fahrt',
      'Gilt bei jedem Ausfall, der das Manövrieren unmöglich macht',
    ],
    note: 'Zwei Bälle sind kein Notruf, aber die Ansage, dass dieses Fahrzeug nichts mehr tun kann. Ausweichen musst du.',
    en: {
      title: 'Vessel not under command',
      subtitle: 'Steering or engine failure',
      rule: 'Rule 27(a)',
      pattern: 'Two black balls in a vertical line',
      signs: [
        'Two balls in a vertical line where they are best seen',
        'If making way through the water, the signals for a vessel under way apply as well',
        'It covers any failure that makes manoeuvring impossible',
      ],
      note: 'Two balls are not a distress call, but they state that this vessel can do nothing more. The keeping clear is up to you.',
    },
  },
  {
    id: 'ram',
    category: 'behindert',
    shapes: [{ k: 'ball', y: 16 }, { k: 'diamond', y: 38 }, { k: 'ball', y: 60 }],
    traits: ['b', 'ball', 'diamond', 'three', 'vertical'],
    title: 'Manövrierbehindertes Fahrzeug',
    subtitle: 'Baggern, Legen von Kabeln, Versorgung in See',
    rule: 'Regel 27 (2)',
    pattern: 'Ball – Rhombus – Ball senkrecht übereinander',
    signs: [
      'Von oben nach unten: Ball, Rhombus, Ball',
      'Behindert ein Arbeitsgerät eine Seite, dazu zwei Bälle senkrecht auf der Seite, an der die Behinderung liegt',
      'Und zwei Rhomben senkrecht auf der Seite, an der frei vorbeigefahren werden kann',
    ],
    note: 'Die zwei Bälle und die zwei Rhomben an den Seiten sind das Wichtigste am ganzen Zeichen: Sie sagen dir, an welcher Seite du vorbeidarfst. Ball heißt hier – wie überall – nein.',
    en: {
      title: 'Vessel restricted in her ability to manoeuvre',
      subtitle: 'Dredging, laying cable, replenishment at sea',
      rule: 'Rule 27(b)',
      pattern: 'Ball – diamond – ball in a vertical line',
      signs: [
        'From the top: ball, diamond, ball',
        'Where an obstruction exists, two balls in a vertical line on the side of the obstruction',
        'And two diamonds in a vertical line on the side on which another vessel may pass',
      ],
      note: 'The two balls and two diamonds on the sides are the whole point of the signal: they tell you which side you may pass. Ball means no, here as everywhere.',
    },
  },
  {
    id: 'cbd',
    category: 'behindert',
    shapes: [{ k: 'cylinder', y: 30 }],
    traits: ['b', 'cylinder', 'one'],
    title: 'Durch Tiefgang behindertes Fahrzeug',
    subtitle: 'Nur im Fahrwasser',
    rule: 'Regel 28',
    pattern: 'Ein schwarzer Zylinder',
    signs: [
      'Ein Zylinder, dort wo er am besten zu sehen ist',
      'Zusätzlich die Zeichen für ein Maschinenfahrzeug in Fahrt',
      'Gilt nur, wenn Tiefgang und verfügbares Wasser das Ausweichen wirklich einschränken',
    ],
    note: 'Ein Zylinder heißt: Dieses Schiff kann die Rinne nicht verlassen, auch wenn es wollte. Frachter im Fehmarnbelt oder in der Elbe führen ihn regelmäßig.',
    en: {
      title: 'Vessel constrained by her draught',
      subtitle: 'In a channel only',
      rule: 'Rule 28',
      pattern: 'One black cylinder',
      signs: [
        'A cylinder where it is best seen',
        'The signals for a power-driven vessel under way apply as well',
        'It applies only where draught and available water really do restrict her ability to deviate',
      ],
      note: 'A cylinder means: this ship cannot leave the channel even if she wanted to. Freighters in the Fehmarn Belt or the Elbe carry it regularly.',
    },
  },
  {
    id: 'fishing',
    category: 'arbeit',
    shapes: [{ k: 'biconic', y: 32 }],
    traits: ['b', 'biconic', 'cone', 'one'],
    title: 'Fahrzeug beim Fischfang',
    subtitle: 'Trawler und andere Fischerei',
    rule: 'Regel 26',
    pattern: 'Zwei Kegel mit den Spitzen aneinander, senkrecht übereinander',
    signs: [
      'Ein Doppelkegel – zwei Kegel, Spitzen zusammen –, dort wo er am besten zu sehen ist',
      'Unter 20 m Länge darf stattdessen ein Korb gesetzt werden',
      'Reicht das Geschirr weiter als 150 m waagerecht vom Fahrzeug weg, zusätzlich ein Kegel mit der Spitze nach oben in dessen Richtung',
    ],
    note: 'Der Kegel mit der Spitze nach oben ist die eigentliche Warnung: Er zeigt, wo die Netze liegen. Dort durchzufahren kostet dich die Schraube und den Fischer sein Geschirr.',
    en: {
      title: 'Vessel engaged in fishing',
      subtitle: 'Trawling and other fishing',
      rule: 'Rule 26',
      pattern: 'Two cones with their points together, in a vertical line',
      signs: [
        'Two cones points together, where they are best seen',
        'Under 20 m a basket may be shown instead',
        'Where the gear extends more than 150 m horizontally, a cone point up in its direction as well',
      ],
      note: 'The cone with its point up is the real warning: it shows where the nets lie. Passing over them costs you your propeller and the fisherman his gear.',
    },
  },
  {
    id: 'fishing-gear',
    category: 'arbeit',
    shapes: [{ k: 'biconic', y: 26 }, { k: 'cone-up', y: 58 }],
    traits: ['b', 'biconic', 'cone', 'two', 'vertical'],
    title: 'Fischer mit weit ausstehendem Geschirr',
    subtitle: 'Netze weiter als 150 m',
    rule: 'Regel 26 (2c)',
    pattern: 'Doppelkegel und darunter ein Kegel, Spitze nach oben, in Richtung des Geschirrs',
    signs: [
      'Der Doppelkegel wie bei jedem Fischer',
      'Dazu ein Kegel mit der Spitze nach oben, gesetzt in die Richtung, in der das Geschirr liegt',
      'Der zweite Kegel ist die Warnung: Auf dieser Seite reicht das Netz weit hinaus',
    ],
    note: 'Halte auf der Seite Abstand, in die der Kegel zeigt – und zwar mehr als die 150 m, ab denen er gesetzt werden muss.',
    en: {
      title: 'Fishing vessel with gear extending far out',
      subtitle: 'Nets more than 150 m',
      rule: 'Rule 26(c)(ii)',
      pattern: 'Two cones points together, and below them a cone point up towards the gear',
      signs: [
        'The two cones as for any fishing vessel',
        'Plus a cone with its point up, shown in the direction in which the gear extends',
        'That second cone is the warning: on this side the net reaches far out',
      ],
      note: 'Keep clear on the side the cone points to – and by more than the 150 m at which it must be shown.',
    },
  },
  {
    id: 'towing',
    category: 'arbeit',
    shapes: [{ k: 'diamond', y: 30 }],
    traits: ['b', 'diamond', 'one'],
    title: 'Schleppzug über 200 m',
    subtitle: 'Schlepper und Anhang',
    rule: 'Regel 24 (1e)',
    pattern: 'Ein schwarzer Rhombus – auf dem Schlepper und auf dem Anhang',
    signs: [
      'Ein Rhombus auf dem schleppenden Fahrzeug, wenn die Schlepplänge 200 m überschreitet',
      'Ein Rhombus auf dem geschleppten Fahrzeug, dort wo er am besten zu sehen ist',
      'Die Schlepplänge zählt vom Heck des Schleppers bis zum hinteren Ende des Anhangs',
    ],
    note: 'Zwischen Schlepper und Anhang liegt eine Trosse, die man nicht sieht und die dich zersägt. Ein Rhombus heißt: Es sind mehr als zweihundert Meter davon. Niemals dazwischen durchfahren.',
    en: {
      title: 'Tow longer than 200 m',
      subtitle: 'Towing vessel and tow',
      rule: 'Rule 24(a)(v)',
      pattern: 'One black diamond – on the towing vessel and on the tow',
      signs: [
        'A diamond on the towing vessel when the length of the tow exceeds 200 m',
        'A diamond on the vessel being towed, where it is best seen',
        'The length of tow runs from the stern of the tug to the after end of the tow',
      ],
      note: 'Between tug and tow lies a wire you cannot see and that will cut you in half. A diamond means there is more than two hundred metres of it. Never pass between them.',
    },
  },
  {
    id: 'minesweeper',
    category: 'arbeit',
    shapes: [{ k: 'ball', y: 18 }, { k: 'ball', y: 44, at: 'port' }, { k: 'ball', y: 44, at: 'stb' }],
    traits: ['b', 'ball', 'three'],
    title: 'Fahrzeug beim Minenräumen',
    subtitle: 'Drei Bälle, aber nicht übereinander',
    rule: 'Regel 27 (6)',
    pattern: 'Ein Ball am Fockmast, je einer an den Nocken der Rah',
    signs: [
      'Ein Ball an der Spitze des vorderen Mastes',
      'Je ein Ball an jeder Nock der vorderen Rah – also nebeneinander, nicht übereinander',
      'Zusätzlich die Zeichen für ein Maschinenfahrzeug in Fahrt',
    ],
    note: 'Näher als 1000 m darf man nicht heran. Die drei Bälle stehen im Dreieck und nicht in einer Linie – das unterscheidet sie vom Fahrzeug auf Grund.',
    en: {
      title: 'Vessel engaged in mine clearance',
      subtitle: 'Three balls, but not in a line',
      rule: 'Rule 27(f)',
      pattern: 'One ball at the foremast head, one at each end of the fore yard',
      signs: [
        'One ball at the head of the foremast',
        'One ball at each yardarm of the fore yard – side by side, not one above the other',
        'The signals for a power-driven vessel under way apply as well',
      ],
      note: 'Do not approach within 1000 m. The three balls stand in a triangle, not in a line – that is what tells them apart from a vessel aground.',
    },
  },
  {
    id: 'diving',
    category: 'arbeit',
    shapes: [{ k: 'flag-a', y: 30 }],
    traits: ['w', 'bu', 'one'],
    title: 'Taucher unter Wasser',
    subtitle: 'Flagge A als fester Körper',
    rule: 'Regel 27 (5)',
    pattern: 'Ein steifes Abbild der Flagge „A“, mindestens 1 m hoch',
    signs: [
      'Ein fester Nachbau der Flagge Alfa – weiß und blau, am Ende eingeschnitten',
      'Mindestens einen Meter hoch, rundum sichtbar aufgestellt',
      'Kleine Tauchfahrzeuge führen das anstelle der Zeichen für manövrierbehinderte Fahrzeuge',
    ],
    note: 'Alfa heißt: Ich habe einen Taucher unten, halte Abstand und fahre langsam. Nicht zu verwechseln mit der roten Flagge mit weißem Schrägstrich – die ist eine amerikanische Tauchflagge und steht in keiner internationalen Regel.',
    en: {
      title: 'Diver down',
      subtitle: 'Flag A as a rigid shape',
      rule: 'Rule 27(e)(ii)',
      pattern: 'A rigid replica of flag “A”, not less than 1 m high',
      signs: [
        'A rigid replica of the flag Alfa – white and blue, swallow-tailed',
        'Not less than one metre high, shown so as to be seen all round',
        'Small diving vessels show this instead of the restricted-in-ability signals',
      ],
      note: 'Alfa means: I have a diver down, keep well clear at slow speed. Not to be confused with the red flag with a white diagonal – that is an American diving flag and appears in no international rule.',
    },
  },
  {
    id: 'sail-only',
    category: 'fahrt',
    shapes: [],
    traits: [],
    title: 'Segelfahrzeug unter Segeln',
    subtitle: 'Kein Signalkörper',
    rule: 'Regel 25',
    pattern: 'Nichts – und genau das ist die Aussage',
    signs: [
      'Ein Segelfahrzeug, das nur segelt, führt bei Tage keinen Signalkörper',
      'Sobald die Maschine mitläuft, kommt der Kegel mit der Spitze nach unten dazu',
    ],
    note: 'Deshalb ist der Kegel so wichtig: Ohne ihn bist du für alle anderen ein Segelfahrzeug – mit allen Rechten, die dir dann nicht mehr zustehen.',
    en: {
      title: 'Sailing vessel under sail',
      subtitle: 'No day shape',
      rule: 'Rule 25',
      pattern: 'Nothing – and that is exactly the statement',
      signs: [
        'A sailing vessel proceeding under sail alone shows no day shape',
        'The moment the engine runs, the cone point down is added',
      ],
      note: 'That is why the cone matters so much: without it you are a sailing vessel to everyone else – with all the rights that then no longer belong to you.',
    },
  },
];

/**
 * Einzelne Flaggen des internationalen Signalbuchs, die auf einer Yacht
 * wirklich vorkommen.
 *
 * `bands` beschreibt die Flagge als Streifen oder Felder – so lässt sie sich
 * ohne Bilddatei zeichnen und bleibt auch offline da. `shape` unterscheidet
 * das rechteckige Tuch vom Doppelstander.
 */
export const SIGNAL_FLAGS = [
  {
    key: 'A',
    name: 'Alfa', shape: 'swallow',
    bands: [{ c: '#ffffff', w: 50 }, { c: '#1263d2', w: 50 }],
    meaning: 'Ich habe einen Taucher unten. Halte sicheren Abstand und fahre langsam.',
    meaningEn: 'I have a diver down; keep well clear at slow speed.',
  },
  {
    key: 'B',
    name: 'Bravo', shape: 'rect',
    bands: [{ c: '#e02020', w: 100 }],
    meaning: 'Ich lade, lösche oder führe gefährliche Güter.',
    meaningEn: 'I am taking in, discharging or carrying dangerous goods.',
  },
  {
    key: 'C',
    name: 'Charlie', shape: 'rect',
    bands: [{ c: '#1263d2', w: 20 }, { c: '#ffffff', w: 20 }, { c: '#e02020', w: 20 }, { c: '#ffffff', w: 20 }, { c: '#1263d2', w: 20 }],
    horizontal: true,
    meaning: 'Ja. Zusammen mit N das Notzeichen des Signalbuchs.',
    meaningEn: 'Yes. Together with N, the distress signal of the code.',
  },
  {
    key: 'D',
    name: 'Delta', shape: 'rect',
    bands: [{ c: '#f2c200', w: 25 }, { c: '#1263d2', w: 50 }, { c: '#f2c200', w: 25 }],
    horizontal: true,
    meaning: 'Halte dich von mir frei, ich manövriere schwer.',
    meaningEn: 'Keep clear of me; I am manoeuvring with difficulty.',
  },
  {
    key: 'H',
    name: 'Hotel', shape: 'rect',
    bands: [{ c: '#ffffff', w: 50 }, { c: '#e02020', w: 50 }],
    meaning: 'Ich habe einen Lotsen an Bord.',
    meaningEn: 'I have a pilot on board.',
  },
  {
    key: 'N',
    name: 'November', shape: 'checker',
    bands: [{ c: '#1263d2' }, { c: '#ffffff' }],
    meaning: 'Nein. Über C gesetzt: Notzeichen.',
    meaningEn: 'No. Hoisted over C: distress.',
  },
  {
    key: 'O',
    name: 'Oscar', shape: 'diag',
    bands: [{ c: '#e02020' }, { c: '#f2c200' }],
    meaning: 'Mann über Bord.',
    meaningEn: 'Man overboard.',
  },
  {
    key: 'V',
    name: 'Victor', shape: 'saltire',
    bands: [{ c: '#ffffff' }, { c: '#e02020' }],
    meaning: 'Ich benötige Hilfe.',
    meaningEn: 'I require assistance.',
  },
  {
    key: 'W',
    name: 'Whiskey', shape: 'rect',
    bands: [{ c: '#e02020', w: 34 }, { c: '#ffffff', w: 33 }, { c: '#1263d2', w: 33 }],
    meaning: 'Ich benötige ärztliche Hilfe.',
    meaningEn: 'I require medical assistance.',
  },
];

/** Trifft ein Eintrag alle gewählten Merkmale? */
export function matchesDayFacets(item, keys) {
  if (!keys || keys.size === 0) return true;
  const traits = item.traits ?? [];
  return [...keys].every((k) => traits.includes(k));
}

/**
 * Die Tagmerkmale einer Tonne – abgeleitet, nicht eingetragen.
 *
 * Die Farben stehen schon in den Farbbändern und die Form im Toppzeichen; sie
 * ein zweites Mal von Hand einzutragen hieße, sie ein zweites Mal falsch
 * eintragen zu können.
 */
export function buoyDayTraits(buoy) {
  const traits = new Set(buoy.bands ?? []);
  const top = buoy.topmark ?? '';
  if (top.includes('cone')) { traits.add('cone'); traits.add('biconic'); }
  if (top.includes('ball') || top.includes('sphere')) traits.add('ball');
  if (top.includes('cylinder') || top.includes('can')) traits.add('cylinder');
  if (top.includes('cross') || top.includes('x')) traits.add('diamond');
  return [...traits];
}

/** Dasselbe für eine Tafel am Ufer: Ihre Farben stehen im Datensatz. */
export function signDayTraits(sign) {
  return [...(sign.colors ?? [])];
}
