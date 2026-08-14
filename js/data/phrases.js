/**
 * Funksprüche für den UKW-Seefunk (GMDSS / Sprechfunk), zweisprachig.
 *
 * Jeder Eintrag trägt die deutsche Fassung direkt und die englische unter `en`.
 * Fehlt ein Feld in `en`, greift die App auf die deutsche Fassung zurück.
 *
 * Platzhalter werden zur Laufzeit aus den Einstellungen bzw. der GPS-Position
 * ersetzt:  {{boat}} {{callsign}} {{mmsi}} {{pob}} {{descr}} {{loa}} {{draft}} {{position}}
 *
 * Zeilen-Typen im `lines`-Array:
 *   { t: 'call',  text }        – laut vorzulesender Funktext (groß dargestellt)
 *   { t: 'fill',  text }        – Textstelle, die selbst ergänzt werden muss
 *   { t: 'slot',  slot, hint }  – wird aus dem gewählten Notfall gefüllt;
 *                                 ohne Auswahl steht dort nur der Hinweis
 *   { t: 'note',  text }        – Hinweis, NICHT vorlesen
 *   { t: 'gap' }                – Absatz / kurze Sprechpause
 */

export const CHANNELS = [
  {
    ch: '16',
    mhz: '156,800',
    use: 'Not-, Dringlichkeits-, Sicherheits- und Anrufkanal. Hörwache halten.',
    useEn: 'Distress, urgency, safety and calling channel. Keep a listening watch.',
  },
  {
    ch: '70',
    mhz: '156,525',
    use: 'DSC – nur digitaler Notalarm, hier wird nicht gesprochen.',
    useEn: 'DSC – digital alerting only, no voice traffic.',
  },
  {
    ch: '13',
    mhz: '156,650',
    use: 'Schiff–Schiff, Sicherheit des Verkehrs (Brücke–Brücke).',
    useEn: 'Ship to ship, bridge to bridge navigation safety.',
  },
  {
    ch: '06',
    mhz: '156,300',
    use: 'Schiff–Schiff, auch SAR-Verkehr mit Flugzeugen.',
    useEn: 'Ship to ship, also SAR co-ordination with aircraft.',
  },
  {
    ch: '08 / 72 / 77',
    mhz: '—',
    use: 'Bordbetrieb / Schiff–Schiff im Nahbereich.',
    useEn: 'Ship to ship working channels, short range.',
  },
  {
    ch: '09',
    mhz: '156,450',
    use: 'Vielerorts Marina- und Hafenkanal (regional unterschiedlich).',
    useEn: 'Marina and harbour channel in many areas (varies regionally).',
  },
];

export const EMERGENCY_CONTACTS = [
  {
    name: 'MRCC Bremen (Seenotleitung)',
    nameEn: 'MRCC Bremen (German rescue co-ordination)',
    value: '+49 421 536870',
    hint: 'Rund um die Uhr besetzt',
    hintEn: 'Manned around the clock',
  },
  {
    name: 'Seenotruf Mobiltelefon (DE)',
    nameEn: 'Sea rescue, mobile phone (Germany)',
    value: '124 124',
    hint: 'Direkt zur Seenotleitung Bremen',
    hintEn: 'Direct line to MRCC Bremen',
  },
  {
    name: 'Bremen Rescue Radio',
    nameEn: 'Bremen Rescue Radio',
    value: 'UKW Kanal 16 / DSC 70',
    hint: 'Funkrufname der Seenotleitung',
    hintEn: 'Call sign of the German rescue co-ordination centre',
  },
  {
    name: 'Europäischer Notruf',
    nameEn: 'European emergency number',
    value: '112',
    hint: 'Auch im Ausland, auch ohne Guthaben',
    hintEn: 'Works abroad and without credit',
  },
];

/** ITU-/NATO-Buchstabiertafel inkl. Aussprache. */
export const SPELLING_ALPHABET = [
  ['A', 'Alfa', 'AL-FA'], ['B', 'Bravo', 'BRA-WO'], ['C', 'Charlie', 'TSCHAR-LI'],
  ['D', 'Delta', 'DEL-TA'], ['E', 'Echo', 'ECK-O'], ['F', 'Foxtrot', 'FOKS-TROTT'],
  ['G', 'Golf', 'GOLF'], ['H', 'Hotel', 'HO-TELL'], ['I', 'India', 'IN-DI-A'],
  ['J', 'Juliett', 'DSCHU-LI-ETT'], ['K', 'Kilo', 'KI-LO'], ['L', 'Lima', 'LI-MA'],
  ['M', 'Mike', 'MAIK'], ['N', 'November', 'NO-WEM-BER'], ['O', 'Oscar', 'OSS-KAR'],
  ['P', 'Papa', 'PA-PA'], ['Q', 'Quebec', 'KE-BECK'], ['R', 'Romeo', 'RO-MI-O'],
  ['S', 'Sierra', 'SI-ERR-A'], ['T', 'Tango', 'TANG-GO'], ['U', 'Uniform', 'JU-NI-FORM'],
  ['V', 'Victor', 'WIK-TOR'], ['W', 'Whiskey', 'WISS-KI'], ['X', 'X-Ray', 'ECKS-RAY'],
  ['Y', 'Yankee', 'JANG-KI'], ['Z', 'Zulu', 'SU-LU'],
];

export const SPELLING_NUMBERS = [
  ['0', 'Nadazero', 'NA-DA-SI-RO'], ['1', 'Unaone', 'U-NA-WANN'], ['2', 'Bissotwo', 'BIS-SO-TU'],
  ['3', 'Terrathree', 'TER-RA-TRI'], ['4', 'Kartefour', 'KAR-TE-FOUR'], ['5', 'Pantafive', 'PANTA-FAIF'],
  ['6', 'Soxisix', 'SOK-SI-SIKS'], ['7', 'Setteseven', 'SET-TE-SEWN'], ['8', 'Oktoeight', 'OK-TO-EIT'],
  ['9', 'Novenine', 'NO-WE-NAIN'], [',', 'Decimal', 'DE-SI-MAL'], ['.', 'Stop', 'STOPP'],
];

/** Verkehrswörter (Prowords) im Sprechfunk. */
export const PROWORDS = [
  ['OVER', 'Kommen', 'Ende meiner Durchsage, ich erwarte Antwort.', 'End of my transmission, a reply is expected.'],
  ['OUT', 'Ende', 'Gespräch beendet, keine Antwort erwartet. Nie zusammen mit OVER!', 'End of work, no reply expected. Never together with OVER.'],
  ['ROGER', 'Verstanden', 'Ich habe Ihre Durchsage empfangen.', 'I have received your last transmission.'],
  ['WILCO', 'Wird ausgeführt', 'Verstanden und ich handle danach.', 'Understood and I will comply.'],
  ['SAY AGAIN', 'Wiederholen Sie', 'Ich habe Sie nicht verstanden, bitte wiederholen.', 'Repeat your message, I did not understand.'],
  ['I SPELL', 'Ich buchstabiere', 'Es folgt die Buchstabiertafel.', 'The phonetic alphabet follows.'],
  ['CORRECTION', 'Berichtigung', 'Ich habe mich versprochen, es gilt Folgendes.', 'An error was made, the correct version follows.'],
  ['STAND BY', 'Warten Sie', 'Bitte warten, ich melde mich wieder.', 'Wait, I will call you back.'],
  ['AFFIRMATIVE / NEGATIVE', 'Ja / Nein', 'Bestätigung bzw. Verneinung.', 'Yes / no.'],
  ['STATION CALLING', 'Rufende Station', 'Ich weiß nicht, wer mich gerufen hat.', 'I do not know who called me.'],
];

/**
 * Häufige Notfälle als fertige Formulierungen.
 *
 * Wird einer ausgewählt, ersetzt er im Funkspruch die beiden offenen Stellen
 * „ICH HABE …“ und „ICH BENÖTIGE …“. Ohne Auswahl bleibt dort der Hinweis
 * stehen – niemand soll im Ernstfall etwas vorlesen, was nicht stimmt.
 *
 * `level` bestimmt, bei welchem Funkspruch der Fall angeboten wird:
 * 'distress' beim MAYDAY, 'urgency' beim PAN-PAN.
 * `dsc` nennt die passende Kategorie am DSC-Gerät.
 */
export const EMERGENCIES = [
  // ---- MAYDAY -------------------------------------------------------------
  {
    id: 'flooding',
    level: 'distress',
    label: 'Wassereinbruch',
    icon: '🌊',
    dsc: 'Flooding',
    nature: 'ICH HABE WASSEREINBRUCH UND SINKE',
    need: 'ICH BENÖTIGE SOFORTIGE HILFE UND LENZPUMPEN',
    en: {
      label: 'Flooding',
      nature: 'I HAVE FLOODING AND I AM SINKING',
      need: 'I REQUIRE IMMEDIATE ASSISTANCE AND PUMPS',
    },
  },
  {
    id: 'fire',
    level: 'distress',
    label: 'Feuer an Bord',
    icon: '🔥',
    dsc: 'Fire, explosion',
    nature: 'ICH HABE FEUER AN BORD',
    need: 'ICH BENÖTIGE SOFORTIGE HILFE BEI DER BRANDBEKÄMPFUNG UND RETTUNG DER BESATZUNG',
    en: {
      label: 'Fire on board',
      nature: 'I HAVE A FIRE ON BOARD',
      need: 'I REQUIRE IMMEDIATE ASSISTANCE WITH FIRE FIGHTING AND EVACUATION',
    },
  },
  {
    id: 'collision',
    level: 'distress',
    label: 'Kollision',
    icon: '💥',
    dsc: 'Collision',
    nature: 'ICH HATTE EINE KOLLISION UND MACHE WASSER',
    need: 'ICH BENÖTIGE SOFORTIGE HILFE',
    en: {
      label: 'Collision',
      nature: 'I HAVE BEEN IN A COLLISION AND I AM TAKING WATER',
      need: 'I REQUIRE IMMEDIATE ASSISTANCE',
    },
  },
  {
    id: 'aground-danger',
    level: 'distress',
    label: 'Grundberührung, in Gefahr',
    icon: '⛰️',
    dsc: 'Grounding',
    nature: 'ICH BIN AUF GRUND GELAUFEN UND SCHLAGE AUF',
    need: 'ICH BENÖTIGE SOFORTIGE HILFE',
    en: {
      label: 'Aground, in danger',
      nature: 'I AM AGROUND AND POUNDING',
      need: 'I REQUIRE IMMEDIATE ASSISTANCE',
    },
  },
  {
    id: 'capsized',
    level: 'distress',
    label: 'Gekentert',
    icon: '🔻',
    dsc: 'Capsizing',
    nature: 'MEIN FAHRZEUG IST GEKENTERT',
    need: 'ICH BENÖTIGE SOFORTIGE RETTUNG DER BESATZUNG',
    en: {
      label: 'Capsized',
      nature: 'MY VESSEL HAS CAPSIZED',
      need: 'I REQUIRE IMMEDIATE RESCUE OF THE CREW',
    },
  },
  {
    id: 'mob',
    level: 'distress',
    label: 'Mensch über Bord',
    icon: '⚑',
    dsc: 'Man over board',
    nature: 'ICH HABE PERSON ÜBER BORD',
    need: 'ICH BENÖTIGE SOFORTIGE HILFE BEI DER SUCHE',
    en: {
      label: 'Man overboard',
      nature: 'I HAVE A MAN OVERBOARD',
      need: 'I REQUIRE IMMEDIATE ASSISTANCE TO SEARCH',
    },
  },
  {
    id: 'abandoning',
    level: 'distress',
    label: 'Schiff verlassen',
    icon: '🛟',
    dsc: 'Abandoning vessel',
    nature: 'ICH VERLASSE DAS SCHIFF UND GEHE IN DIE RETTUNGSINSEL',
    need: 'ICH BENÖTIGE SOFORTIGE RETTUNG',
    en: {
      label: 'Abandoning vessel',
      nature: 'I AM ABANDONING VESSEL AND TAKING TO THE LIFERAFT',
      need: 'I REQUIRE IMMEDIATE RESCUE',
    },
  },
  {
    id: 'medical-critical',
    level: 'distress',
    label: 'Lebensgefahr, medizinisch',
    icon: '🚑',
    dsc: 'Undesignated distress',
    nature: 'ICH HABE EINEN LEBENSBEDROHLICHEN MEDIZINISCHEN NOTFALL AN BORD',
    need: 'ICH BENÖTIGE SOFORTIGE ÄRZTLICHE HILFE UND EVAKUIERUNG',
    en: {
      label: 'Life-threatening medical',
      nature: 'I HAVE A LIFE-THREATENING MEDICAL EMERGENCY ON BOARD',
      need: 'I REQUIRE IMMEDIATE MEDICAL ASSISTANCE AND EVACUATION',
    },
  },
  {
    id: 'sinking-adrift',
    level: 'distress',
    label: 'Manövrierunfähig in Gefahr',
    icon: '⚓',
    dsc: 'Disabled and adrift',
    nature: 'ICH BIN MANÖVRIERUNFÄHIG UND TREIBE AUF DIE KÜSTE ZU',
    need: 'ICH BENÖTIGE SOFORTIGE HILFE',
    en: {
      label: 'Disabled and adrift',
      nature: 'I AM DISABLED AND ADRIFT TOWARDS THE SHORE',
      need: 'I REQUIRE IMMEDIATE ASSISTANCE',
    },
  },

  // ---- PAN-PAN ------------------------------------------------------------
  {
    id: 'engine',
    level: 'urgency',
    label: 'Maschinenausfall',
    icon: '⚙️',
    nature: 'ICH HABE MASCHINENAUSFALL UND TREIBE',
    need: 'ICH BENÖTIGE SCHLEPPHILFE',
    en: {
      label: 'Engine failure',
      nature: 'I HAVE ENGINE FAILURE AND I AM ADRIFT',
      need: 'I REQUIRE A TOW',
    },
  },
  {
    id: 'rudder',
    level: 'urgency',
    label: 'Ruderausfall',
    icon: '🕹️',
    nature: 'ICH HABE RUDERAUSFALL UND KANN NICHT STEUERN',
    need: 'ICH BENÖTIGE SCHLEPPHILFE ODER BEGLEITUNG',
    en: {
      label: 'Rudder failure',
      nature: 'I HAVE RUDDER FAILURE AND CANNOT STEER',
      need: 'I REQUIRE A TOW OR AN ESCORT',
    },
  },
  {
    id: 'dismasted',
    level: 'urgency',
    label: 'Mastbruch',
    icon: '⛵',
    nature: 'ICH HABE MASTBRUCH, DAS RIGG LIEGT AUSSENBORDS',
    need: 'ICH BENÖTIGE SCHLEPPHILFE',
    en: {
      label: 'Dismasted',
      nature: 'I AM DISMASTED, THE RIG IS OVER THE SIDE',
      need: 'I REQUIRE A TOW',
    },
  },
  {
    id: 'leak-controlled',
    level: 'urgency',
    label: 'Leck unter Kontrolle',
    icon: '💧',
    nature: 'ICH HABE EIN LECK, DAS ICH NOCH UNTER KONTROLLE HABE',
    need: 'ICH BENÖTIGE BEGLEITUNG UND BEREITSCHAFT',
    en: {
      label: 'Leak under control',
      nature: 'I HAVE A LEAK WHICH IS STILL UNDER CONTROL',
      need: 'I REQUIRE AN ESCORT AND VESSELS TO STAND BY',
    },
  },
  {
    id: 'aground-safe',
    level: 'urgency',
    label: 'Grundberührung, keine Gefahr',
    icon: '⛰️',
    nature: 'ICH BIN AUF GRUND GELAUFEN, ES BESTEHT KEINE UNMITTELBARE GEFAHR',
    need: 'ICH BENÖTIGE SCHLEPPHILFE BEIM FREIKOMMEN',
    en: {
      label: 'Aground, no danger',
      nature: 'I AM AGROUND, THERE IS NO IMMEDIATE DANGER',
      need: 'I REQUIRE A TOW TO REFLOAT',
    },
  },
  {
    id: 'medical-advice',
    level: 'urgency',
    label: 'Verletzung oder Erkrankung',
    icon: '🩹',
    nature: 'ICH HABE EINE VERLETZTE PERSON AN BORD',
    need: 'ICH BENÖTIGE ÄRZTLICHE BERATUNG',
    en: {
      label: 'Injury or illness',
      nature: 'I HAVE AN INJURED PERSON ON BOARD',
      need: 'I REQUIRE MEDICAL ADVICE',
    },
  },
  {
    id: 'no-fuel',
    level: 'urgency',
    label: 'Kein Treibstoff',
    icon: '⛽',
    nature: 'ICH HABE KEINEN TREIBSTOFF MEHR UND TREIBE',
    need: 'ICH BENÖTIGE SCHLEPPHILFE',
    en: {
      label: 'Out of fuel',
      nature: 'I HAVE RUN OUT OF FUEL AND I AM ADRIFT',
      need: 'I REQUIRE A TOW',
    },
  },
  {
    id: 'lost',
    level: 'urgency',
    label: 'Position unklar',
    icon: '❓',
    nature: 'ICH KENNE MEINE POSITION NICHT SICHER UND HABE KEINE NAVIGATIONSMITTEL MEHR',
    need: 'ICH BENÖTIGE HILFE BEI DER NAVIGATION',
    en: {
      label: 'Position uncertain',
      nature: 'I AM UNSURE OF MY POSITION AND HAVE LOST MY NAVIGATION EQUIPMENT',
      need: 'I REQUIRE NAVIGATIONAL ASSISTANCE',
    },
  },
];

/** Die zu einem Funkspruch passenden Notfälle. */
export function emergenciesFor(phrase) {
  if (!phrase?.lines?.some((l) => l.t === 'slot')) return [];
  return EMERGENCIES.filter((e) => e.level === phrase.level);
}

/** Die eigentlichen Funkspruch-Vorlagen. */
export const PHRASES = [
  {
    id: 'mayday',
    title: 'MAYDAY – Notruf',
    short: 'Unmittelbare Gefahr für Schiff oder Menschenleben',
    level: 'distress',
    channel: 'Kanal 16 (nach DSC-Alarm auf Kanal 70)',
    before: [
      'Zuerst DSC-Notalarm auslösen (rote Taste, 5 Sekunden halten).',
      'Gerät schaltet selbst auf Kanal 16 – dann diesen Text sprechen.',
      'Langsam und deutlich sprechen. Der Text wird wiederholt, bis geantwortet wird.',
    ],
    lines: [
      { t: 'call', text: 'MAYDAY – MAYDAY – MAYDAY' },
      { t: 'call', text: 'HIER IST {{boat}} – {{boat}} – {{boat}}' },
      { t: 'gap' },
      { t: 'call', text: 'MAYDAY {{boat}}' },
      { t: 'call', text: 'Rufzeichen {{callsign}}, MMSI {{mmsi}}' },
      { t: 'call', text: 'MEINE POSITION IST {{position}}' },
      { t: 'slot', slot: 'nature', hint: 'ICH HABE … – hier den Notfall schildern' },
      { t: 'slot', slot: 'need', hint: 'ICH BENÖTIGE … – hier die benötigte Hilfe nennen' },
      { t: 'call', text: 'AN BORD SIND {{pob}} PERSONEN' },
      { t: 'call', text: '{{descr}}' },
      { t: 'fill', text: '… (weitere Angaben: Rettungsinsel ausgesetzt, Schwimmwesten an, Seenotsignale vorhanden)' },
      { t: 'call', text: 'OVER' },
    ],
    after: [
      'Keine Antwort? Text nach 1–2 Minuten wiederholen.',
      'Funkgerät eingeschaltet lassen und Hörwache auf Kanal 16 halten.',
      'Position, Zeit und Lage laufend nachmelden, wenn sie sich ändern.',
    ],
    en: {
      title: 'MAYDAY – distress call',
      short: 'Grave and imminent danger to vessel or life',
      channel: 'Channel 16 (after the DSC alert on channel 70)',
      before: [
        'Send the DSC distress alert first (red button, hold for 5 seconds).',
        'The set switches to channel 16 by itself – then read this out.',
        'Speak slowly and clearly. Repeat until someone answers.',
      ],
      lines: [
        { t: 'call', text: 'MAYDAY – MAYDAY – MAYDAY' },
        { t: 'call', text: 'THIS IS {{boat}} – {{boat}} – {{boat}}' },
        { t: 'gap' },
        { t: 'call', text: 'MAYDAY {{boat}}' },
        { t: 'call', text: 'Call sign {{callsign}}, MMSI {{mmsi}}' },
        { t: 'call', text: 'MY POSITION IS {{position}}' },
        { t: 'slot', slot: 'nature', hint: 'I HAVE … – describe the emergency here' },
        { t: 'slot', slot: 'need', hint: 'I REQUIRE … – state the assistance needed here' },
        { t: 'call', text: '{{pob}} PERSONS ON BOARD' },
        { t: 'call', text: '{{descr}}' },
        { t: 'fill', text: '… (any other information: liferaft launched, lifejackets worn, flares on board)' },
        { t: 'call', text: 'OVER' },
      ],
      after: [
        'No answer? Repeat the message after one or two minutes.',
        'Leave the set switched on and keep a listening watch on channel 16.',
        'Keep reporting position, time and situation as they change.',
      ],
    },
  },

  {
    id: 'dsc',
    title: 'DSC-Notalarm auslösen',
    short: 'Bedienschritte am Funkgerät – vor dem MAYDAY',
    level: 'distress',
    channel: 'Kanal 70 (automatisch)',
    checklist: [
      'Rote Abdeckklappe „DISTRESS“ öffnen.',
      'Wenn Zeit bleibt: Art der Not wählen (Sinking, Fire, Flooding, Collision, Grounding, Listing, Disabled and adrift, Abandoning, Man over board, Piracy).',
      'Position prüfen. Ohne GPS-Kopplung Position und UTC-Zeit von Hand eingeben.',
      'DISTRESS-Taste ca. 5 Sekunden gedrückt halten, bis der Alarm ausgelöst wird.',
      'Gerät geht selbstständig auf Kanal 16 – jetzt den Sprech-MAYDAY absetzen.',
      'Der Alarm wiederholt sich automatisch alle 3,5 bis 4,5 Minuten bis zur Bestätigung.',
      'Zusätzlich: EPIRB aktivieren, AIS-SART einschalten, Seenotsignale bereitlegen.',
    ],
    lines: [],
    after: [
      'Fehlalarm ausgelöst? Nicht ausschalten – sofort über „Fehlalarm widerrufen“ annullieren.',
    ],
    en: {
      title: 'Sending the DSC distress alert',
      short: 'What to press on the radio – before the spoken MAYDAY',
      channel: 'Channel 70 (automatic)',
      checklist: [
        'Lift the red DISTRESS cover.',
        'If there is time: select the nature of distress (sinking, fire, flooding, collision, grounding, listing, disabled and adrift, abandoning, man over board, piracy).',
        'Check the position. Without a GPS feed, enter position and UTC time by hand.',
        'Press and hold DISTRESS for about 5 seconds until the alert goes out.',
        'The set switches to channel 16 by itself – now send the spoken MAYDAY.',
        'The alert repeats every 3.5 to 4.5 minutes until it is acknowledged.',
        'In addition: activate the EPIRB, switch on the AIS-SART, get the flares ready.',
      ],
      after: [
        'Sent by mistake? Do not switch off – cancel it straight away.',
      ],
    },
  },

  {
    id: 'mayday-relay',
    title: 'MAYDAY RELAY – Notruf weiterleiten',
    short: 'Ein anderes Fahrzeug ist in Not und kann selbst nicht senden',
    level: 'distress',
    channel: 'Kanal 16',
    before: [
      'Nur senden, wenn der Notruf sonst niemanden erreicht oder du selbst Zeuge einer Notlage bist.',
      'Nicht senden, wenn eine Küstenfunkstelle den Notruf bereits bestätigt hat.',
    ],
    lines: [
      { t: 'call', text: 'MAYDAY RELAY – MAYDAY RELAY – MAYDAY RELAY' },
      { t: 'call', text: 'AN ALLE FUNKSTELLEN – AN ALLE FUNKSTELLEN – AN ALLE FUNKSTELLEN' },
      { t: 'call', text: 'HIER IST {{boat}} – {{boat}} – {{boat}}' },
      { t: 'call', text: 'Rufzeichen {{callsign}}, MMSI {{mmsi}}' },
      { t: 'gap' },
      { t: 'fill', text: 'ICH ÜBERMITTLE FOLGENDEN NOTRUF … (empfangenen Wortlaut wiederholen)' },
      { t: 'fill', text: 'oder: ICH BEOBACHTE … (was ist zu sehen: Fahrzeug in Not, Person im Wasser)' },
      { t: 'fill', text: 'POSITION DES HAVARISTEN … (oder Peilung und Abstand von meiner Position)' },
      { t: 'call', text: 'MEINE POSITION IST {{position}}' },
      { t: 'call', text: 'OVER' },
    ],
    en: {
      title: 'MAYDAY RELAY – passing on a distress call',
      short: 'Another vessel is in distress and cannot transmit',
      channel: 'Channel 16',
      before: [
        'Only send this if the distress call would otherwise go unheard, or if you witness the distress yourself.',
        'Do not send it once a coast station has acknowledged the call.',
      ],
      lines: [
        { t: 'call', text: 'MAYDAY RELAY – MAYDAY RELAY – MAYDAY RELAY' },
        { t: 'call', text: 'ALL STATIONS – ALL STATIONS – ALL STATIONS' },
        { t: 'call', text: 'THIS IS {{boat}} – {{boat}} – {{boat}}' },
        { t: 'call', text: 'Call sign {{callsign}}, MMSI {{mmsi}}' },
        { t: 'gap' },
        { t: 'fill', text: 'I RELAY THE FOLLOWING DISTRESS MESSAGE … (repeat what you received)' },
        { t: 'fill', text: 'or: I HAVE SIGHTED … (a vessel in distress, a person in the water)' },
        { t: 'fill', text: 'POSITION OF THE CASUALTY … (or bearing and distance from my position)' },
        { t: 'call', text: 'MY POSITION IS {{position}}' },
        { t: 'call', text: 'OVER' },
      ],
    },
  },

  {
    id: 'pan-pan',
    title: 'PAN-PAN – Dringlichkeitsmeldung',
    short: 'Dringende Hilfe nötig, aber (noch) keine unmittelbare Gefahr',
    level: 'urgency',
    channel: 'Kanal 16',
    before: [
      'Typische Fälle: Maschinen- oder Ruderausfall, Mastbruch, treibend ohne Antrieb, leichter Wassereinbruch unter Kontrolle.',
      'Aussprache: „PANN-PANN“.',
    ],
    lines: [
      { t: 'call', text: 'PAN-PAN – PAN-PAN – PAN-PAN' },
      { t: 'call', text: 'AN ALLE FUNKSTELLEN – AN ALLE FUNKSTELLEN – AN ALLE FUNKSTELLEN' },
      { t: 'call', text: 'HIER IST {{boat}} – {{boat}} – {{boat}}' },
      { t: 'call', text: 'Rufzeichen {{callsign}}, MMSI {{mmsi}}' },
      { t: 'call', text: 'MEINE POSITION IST {{position}}' },
      { t: 'slot', slot: 'nature', hint: 'ICH HABE … – hier den Notfall schildern' },
      { t: 'slot', slot: 'need', hint: 'ICH BENÖTIGE … – hier die benötigte Hilfe nennen' },
      { t: 'call', text: 'AN BORD SIND {{pob}} PERSONEN' },
      { t: 'call', text: '{{descr}}' },
      { t: 'call', text: 'OVER' },
    ],
    after: ['Wird die Lage schlimmer, sofort auf MAYDAY hochstufen.'],
    en: {
      title: 'PAN-PAN – urgency call',
      short: 'Urgent assistance needed, but no immediate danger yet',
      channel: 'Channel 16',
      before: [
        'Typical cases: engine or rudder failure, dismasted, adrift without propulsion, minor flooding under control.',
        'Pronounced “PAHN-PAHN”.',
      ],
      lines: [
        { t: 'call', text: 'PAN-PAN – PAN-PAN – PAN-PAN' },
        { t: 'call', text: 'ALL STATIONS – ALL STATIONS – ALL STATIONS' },
        { t: 'call', text: 'THIS IS {{boat}} – {{boat}} – {{boat}}' },
        { t: 'call', text: 'Call sign {{callsign}}, MMSI {{mmsi}}' },
        { t: 'call', text: 'MY POSITION IS {{position}}' },
        { t: 'slot', slot: 'nature', hint: 'I HAVE … – describe the problem here' },
        { t: 'slot', slot: 'need', hint: 'I REQUIRE … – state the assistance needed here' },
        { t: 'call', text: '{{pob}} PERSONS ON BOARD' },
        { t: 'call', text: '{{descr}}' },
        { t: 'call', text: 'OVER' },
      ],
      after: ['If the situation gets worse, upgrade to MAYDAY without delay.'],
    },
  },

  {
    id: 'medico',
    title: 'PAN-PAN MEDICO – ärztliche Beratung',
    short: 'Verletzung oder Erkrankung an Bord',
    level: 'urgency',
    channel: 'Kanal 16, dann Arbeitskanal',
    before: [
      'In deutschen Gewässern über Bremen Rescue Radio; die Beratung übernimmt der Funkarzt (Medico Cuxhaven).',
      'Vorher notieren: Alter, Geschlecht, Beschwerden, Puls, Atmung, Bewusstsein, Medikamente, Zeitpunkt des Unfalls.',
    ],
    lines: [
      { t: 'call', text: 'PAN-PAN – PAN-PAN – PAN-PAN' },
      { t: 'call', text: 'BREMEN RESCUE RADIO – BREMEN RESCUE RADIO – BREMEN RESCUE RADIO' },
      { t: 'call', text: 'HIER IST {{boat}} – {{boat}} – {{boat}}' },
      { t: 'call', text: 'Rufzeichen {{callsign}}, MMSI {{mmsi}}' },
      { t: 'call', text: 'MEINE POSITION IST {{position}}' },
      { t: 'call', text: 'ICH BENÖTIGE ÄRZTLICHE BERATUNG – MEDICO' },
      { t: 'fill', text: 'AN BORD IST … (Alter, Geschlecht, was ist passiert, welche Beschwerden)' },
      { t: 'call', text: 'OVER' },
    ],
    after: ['Wird eine Evakuierung nötig, koordiniert die Seenotleitung alles Weitere.'],
    en: {
      title: 'PAN-PAN MEDICO – medical advice',
      short: 'Injury or illness on board',
      channel: 'Channel 16, then a working channel',
      before: [
        'Call the responsible rescue co-ordination centre; the radio doctor gives the advice.',
        'Note down first: age, sex, symptoms, pulse, breathing, level of consciousness, medication, time of the accident.',
      ],
      lines: [
        { t: 'call', text: 'PAN-PAN – PAN-PAN – PAN-PAN' },
        { t: 'fill', text: '(RESCUE CO-ORDINATION CENTRE) – three times' },
        { t: 'call', text: 'THIS IS {{boat}} – {{boat}} – {{boat}}' },
        { t: 'call', text: 'Call sign {{callsign}}, MMSI {{mmsi}}' },
        { t: 'call', text: 'MY POSITION IS {{position}}' },
        { t: 'call', text: 'I REQUIRE MEDICAL ADVICE' },
        { t: 'fill', text: 'I HAVE ON BOARD … (age, sex, what happened, symptoms)' },
        { t: 'call', text: 'OVER' },
      ],
      after: ['If an evacuation becomes necessary, the rescue centre co-ordinates everything else.'],
    },
  },

  {
    id: 'securite',
    title: 'SÉCURITÉ – Sicherheitsmeldung',
    short: 'Gefahr für die Schifffahrt oder Wetterwarnung',
    level: 'safety',
    channel: 'Ankündigung Kanal 16, Meldung auf Arbeitskanal',
    before: [
      'Aussprache: „Sä-kü-ri-TEE“.',
      'Typische Fälle: treibender Container, verlorene Ladung, ausgefallenes Seezeichen, Netz im Fahrwasser.',
      'Ankündigung auf Kanal 16, die eigentliche Meldung dann auf einem Arbeitskanal.',
    ],
    lines: [
      { t: 'call', text: 'SÉCURITÉ – SÉCURITÉ – SÉCURITÉ' },
      { t: 'call', text: 'AN ALLE FUNKSTELLEN – AN ALLE FUNKSTELLEN – AN ALLE FUNKSTELLEN' },
      { t: 'call', text: 'HIER IST {{boat}} – {{boat}} – {{boat}}, Rufzeichen {{callsign}}' },
      { t: 'fill', text: 'GEHEN SIE AUF KANAL … (Arbeitskanal nennen)' },
      { t: 'call', text: 'OUT' },
      { t: 'gap' },
      { t: 'note', text: 'Auf dem Arbeitskanal weiter:' },
      { t: 'call', text: 'SÉCURITÉ – SÉCURITÉ – SÉCURITÉ' },
      { t: 'call', text: 'HIER IST {{boat}}' },
      { t: 'fill', text: 'IN POSITION … TREIBT … (was, wie groß, wie gefährlich, seit wann)' },
      { t: 'call', text: 'OUT' },
    ],
    en: {
      title: 'SECURITE – safety message',
      short: 'A hazard to navigation or a weather warning',
      channel: 'Announcement on channel 16, message on a working channel',
      before: [
        'Pronounced “say-cure-e-tay”.',
        'Typical cases: a drifting container, lost cargo, an unlit buoy, nets in the fairway.',
        'Announce on channel 16, then give the message itself on a working channel.',
      ],
      lines: [
        { t: 'call', text: 'SECURITE – SECURITE – SECURITE' },
        { t: 'call', text: 'ALL STATIONS – ALL STATIONS – ALL STATIONS' },
        { t: 'call', text: 'THIS IS {{boat}} – {{boat}} – {{boat}}, call sign {{callsign}}' },
        { t: 'fill', text: 'SWITCH TO CHANNEL … (name the working channel)' },
        { t: 'call', text: 'OUT' },
        { t: 'gap' },
        { t: 'note', text: 'On the working channel:' },
        { t: 'call', text: 'SECURITE – SECURITE – SECURITE' },
        { t: 'call', text: 'THIS IS {{boat}}' },
        { t: 'fill', text: 'IN POSITION … THERE IS … (what, how big, how dangerous, since when)' },
        { t: 'call', text: 'OUT' },
      ],
    },
  },

  {
    id: 'mob',
    title: 'Mensch über Bord',
    short: 'Sofortmaßnahmen an Bord und Funkspruch',
    level: 'distress',
    channel: 'Kanal 16 (nach DSC-Alarm)',
    checklist: [
      'Laut rufen: „Mensch über Bord!“ – eine Person zeigt ununterbrochen auf den Verunfallten.',
      'Rettungsmittel sofort werfen (Rettungsring, Boje, Blitzlicht).',
      'MOB-Taste am GPS/Plotter drücken – in dieser App: Reiter „Position“ → MOB.',
      'Manöver einleiten (Quickstopp / Q-Wende), Motor an, Leinen prüfen.',
      'Funkspruch absetzen, wenn die Person nicht sofort wieder an Bord ist.',
    ],
    lines: [
      { t: 'call', text: 'MAYDAY – MAYDAY – MAYDAY' },
      { t: 'call', text: 'HIER IST {{boat}} – {{boat}} – {{boat}}' },
      { t: 'gap' },
      { t: 'call', text: 'MAYDAY {{boat}}, Rufzeichen {{callsign}}, MMSI {{mmsi}}' },
      { t: 'call', text: 'MEINE POSITION IST {{position}}' },
      { t: 'call', text: 'ICH HABE PERSON ÜBER BORD' },
      { t: 'call', text: 'ICH BENÖTIGE SOFORTIGE HILFE BEI DER SUCHE' },
      { t: 'fill', text: 'DIE PERSON GING ÜBER BORD UM … UHR, TRÄGT … (Schwimmweste? Kleidungsfarbe?)' },
      { t: 'call', text: 'AN BORD SIND NOCH {{pob}} PERSONEN' },
      { t: 'call', text: 'OVER' },
    ],
    en: {
      title: 'Man overboard',
      short: 'Immediate actions on board and the radio call',
      channel: 'Channel 16 (after the DSC alert)',
      checklist: [
        'Shout “man overboard!” – one person points at the casualty and never looks away.',
        'Throw lifesaving gear immediately (lifebuoy, danbuoy, light).',
        'Press the MOB button on the GPS or plotter – in this app: tab “Position” → MOB.',
        'Start the recovery manoeuvre (quick stop), engine on, check for lines in the water.',
        'Send the radio call if the person is not back on board straight away.',
      ],
      lines: [
        { t: 'call', text: 'MAYDAY – MAYDAY – MAYDAY' },
        { t: 'call', text: 'THIS IS {{boat}} – {{boat}} – {{boat}}' },
        { t: 'gap' },
        { t: 'call', text: 'MAYDAY {{boat}}, call sign {{callsign}}, MMSI {{mmsi}}' },
        { t: 'call', text: 'MY POSITION IS {{position}}' },
        { t: 'call', text: 'I HAVE A MAN OVERBOARD' },
        { t: 'call', text: 'I REQUIRE IMMEDIATE ASSISTANCE TO SEARCH' },
        { t: 'fill', text: 'THE PERSON WENT OVERBOARD AT … HOURS, WEARING … (lifejacket? colour of clothing?)' },
        { t: 'call', text: '{{pob}} PERSONS REMAIN ON BOARD' },
        { t: 'call', text: 'OVER' },
      ],
    },
  },

  {
    id: 'routine',
    title: 'Routineanruf',
    short: 'Marina, Schleuse, Brücke oder anderes Fahrzeug rufen',
    level: 'routine',
    channel: 'Kanal 16 oder Stationskanal',
    before: ['Vorher kurz mithören, ob der Kanal frei ist.'],
    lines: [
      { t: 'fill', text: '(NAME DER STATION) – (NAME DER STATION) – (NAME DER STATION)' },
      { t: 'call', text: 'HIER IST {{boat}} – {{boat}} – {{boat}}, Rufzeichen {{callsign}}' },
      { t: 'call', text: 'OVER' },
      { t: 'gap' },
      { t: 'note', text: 'Nach der Antwort – Kanal wechseln und das Anliegen nennen:' },
      { t: 'fill', text: 'GEHEN SIE AUF KANAL … / Ich habe verstanden, wechsle auf Kanal …' },
      { t: 'fill', text: 'Anliegen: Liegeplatz für heute Nacht / Schleusung / Brückenöffnung / Bunkern' },
      { t: 'call', text: 'Länge {{loa}}, Tiefgang {{draft}}, {{pob}} Personen an Bord' },
      { t: 'call', text: 'OVER' },
    ],
    en: {
      title: 'Routine call',
      short: 'Calling a marina, a lock, a bridge or another vessel',
      channel: 'Channel 16 or the station’s own channel',
      before: ['Listen first to make sure the channel is free.'],
      lines: [
        { t: 'fill', text: '(STATION NAME) – (STATION NAME) – (STATION NAME)' },
        { t: 'call', text: 'THIS IS {{boat}} – {{boat}} – {{boat}}, call sign {{callsign}}' },
        { t: 'call', text: 'OVER' },
        { t: 'gap' },
        { t: 'note', text: 'After the reply – change channel and state your business:' },
        { t: 'fill', text: 'SWITCH TO CHANNEL … / Roger, changing to channel …' },
        { t: 'fill', text: 'Request: a berth for tonight / lock passage / bridge opening / fuel' },
        { t: 'call', text: 'Length {{loa}}, draft {{draft}}, {{pob}} persons on board' },
        { t: 'call', text: 'OVER' },
      ],
    },
  },

  {
    id: 'radiocheck',
    title: 'Funkkontrolle / Radio Check',
    short: 'Prüfen, ob die Anlage sendet und empfängt',
    level: 'routine',
    channel: 'Arbeitskanal – nicht auf Kanal 16',
    before: [
      'Funkkontrollgespräche gehören nicht auf Kanal 16. Marina, Nachbarschiff oder einen Arbeitskanal nutzen.',
      'Antwortstufen der Verständlichkeit: 1 unverständlich · 2 zeitweise verständlich · 3 mit Mühe verständlich · 4 verständlich · 5 ausgezeichnet.',
    ],
    lines: [
      { t: 'fill', text: '(NAME DER STATION), hier ist {{boat}}, Rufzeichen {{callsign}}' },
      { t: 'call', text: 'FUNKKONTROLLE – wie ist meine Verständlichkeit?' },
      { t: 'call', text: 'OVER' },
      { t: 'gap' },
      { t: 'note', text: 'Antwort z. B.: „Ich höre Sie laut und deutlich, Stufe 5.“' },
      { t: 'call', text: 'Vielen Dank, {{boat}}, OUT' },
    ],
    en: {
      title: 'Radio check',
      short: 'Making sure the set transmits and receives',
      channel: 'A working channel – not channel 16',
      before: [
        'Radio checks do not belong on channel 16. Use a marina, a neighbouring boat or a working channel.',
        'Readability scale: 1 unreadable · 2 readable now and then · 3 readable with difficulty · 4 readable · 5 perfectly readable.',
      ],
      lines: [
        { t: 'fill', text: '(STATION NAME), this is {{boat}}, call sign {{callsign}}' },
        { t: 'call', text: 'RADIO CHECK – how do you read me?' },
        { t: 'call', text: 'OVER' },
        { t: 'gap' },
        { t: 'note', text: 'Typical reply: “I read you loud and clear.”' },
        { t: 'call', text: 'Thank you, {{boat}}, OUT' },
      ],
    },
  },

  {
    id: 'cancel',
    title: 'Fehlalarm widerrufen',
    short: 'Versehentlichen DSC-Alarm oder Notruf annullieren',
    level: 'urgency',
    channel: 'Kanal 16',
    before: [
      'Niemals einfach ausschalten – ein unwiderrufener Alarm löst eine Suchaktion aus.',
      'Sofort nach dem Fehlalarm senden, auf Kanal 16.',
    ],
    lines: [
      { t: 'call', text: 'AN ALLE FUNKSTELLEN – AN ALLE FUNKSTELLEN – AN ALLE FUNKSTELLEN' },
      { t: 'call', text: 'HIER IST {{boat}} – {{boat}} – {{boat}}' },
      { t: 'call', text: 'Rufzeichen {{callsign}}, MMSI {{mmsi}}' },
      { t: 'call', text: 'MEINE POSITION IST {{position}}' },
      { t: 'fill', text: 'MEIN DSC-NOTALARM UM … UHR UTC WAR UNBEABSICHTIGT' },
      { t: 'call', text: 'BITTE ANNULLIEREN SIE DIESEN NOTALARM' },
      { t: 'call', text: 'OUT' },
    ],
    en: {
      title: 'Cancelling a false alert',
      short: 'Withdrawing an accidental DSC alert or distress call',
      channel: 'Channel 16',
      before: [
        'Never just switch off – an alert left standing starts a search operation.',
        'Send this immediately after the false alert, on channel 16.',
      ],
      lines: [
        { t: 'call', text: 'ALL STATIONS – ALL STATIONS – ALL STATIONS' },
        { t: 'call', text: 'THIS IS {{boat}} – {{boat}} – {{boat}}' },
        { t: 'call', text: 'Call sign {{callsign}}, MMSI {{mmsi}}' },
        { t: 'call', text: 'MY POSITION IS {{position}}' },
        { t: 'fill', text: 'MY DISTRESS ALERT AT … UTC WAS TRANSMITTED IN ERROR' },
        { t: 'call', text: 'CANCEL MY DISTRESS ALERT' },
        { t: 'call', text: 'OUT' },
      ],
    },
  },

  {
    id: 'seelonce',
    title: 'Notverkehr – SEELONCE & Co.',
    short: 'Was die Wörter im laufenden Notverkehr bedeuten',
    level: 'safety',
    channel: 'Kanal 16',
    checklist: [
      'SEELONCE MAYDAY – gesendet vom Havaristen oder der leitenden Station: alle anderen schweigen.',
      'SEELONCE DISTRESS – gesendet von einer anderen Station, die den Notverkehr schützt.',
      'PRUDONCE – der Notverkehr läuft noch, eingeschränkter Funkverkehr ist wieder erlaubt.',
      'SEELONCE FEENEE – der Notverkehr ist beendet, der Kanal ist wieder frei.',
      'Als Unbeteiligter gilt: Klappe halten, mithören, mitschreiben. Nur melden, wenn du wirklich helfen kannst.',
    ],
    lines: [],
    en: {
      title: 'Distress traffic – SEELONCE and the rest',
      short: 'What the words mean while distress traffic is running',
      channel: 'Channel 16',
      checklist: [
        'SEELONCE MAYDAY – sent by the vessel in distress or the controlling station: everyone else keeps quiet.',
        'SEELONCE DISTRESS – sent by any other station protecting the distress traffic.',
        'PRUDONCE – distress traffic still runs, but restricted working may resume.',
        'SEELONCE FEENEE – distress traffic is over, the channel is free again.',
        'If you are not involved: stay off the air, listen, write it down. Speak up only if you can genuinely help.',
      ],
    },
  },
];

/**
 * Liefert ein Feld in der gewünschten Sprache und fällt auf Deutsch zurück,
 * wenn keine Übersetzung hinterlegt ist.
 */
export function localized(phrase, field, lang) {
  if (lang === 'en' && phrase.en && phrase.en[field] !== undefined) return phrase.en[field];
  return phrase[field];
}

/**
 * Ein Rufzeichen Zeichen für Zeichen ausgeschrieben.
 *
 * „DA1234“ wird zu „Delta Alfa 1 2 3 4“: Buchstaben als Wort, Ziffern als
 * Ziffer. Wer es im Notfall vorliest, hat genau das vor Augen zu haben – nicht
 * die vier Zeichen, aus denen er es selbst zusammensetzen müsste.
 *
 * Bei den Ziffern bleibt es bewusst bei den Ziffern. Die Zahlwörter des
 * Seefunks – Unaone, Bissotwo, Terrathree, Kartefour – sind über schlechtes
 * Rauschen sicherer zu verstehen, aber wer sie nicht auswendig kann, liest
 * sie stockend vor oder liest sie falsch, und dann sind sie schlechter als
 * gar nichts. Wer sie will, schaltet sie mit `zahlwoerter` ein.
 *
 * Zeichen, für die es kein Wort gibt, bleiben stehen, wie sie sind.
 */
export function spellOut(text, { zahlwoerter = false } = {}) {
  const buchstaben = new Map(SPELLING_ALPHABET.map(([l, w]) => [l, w]));
  const ziffern = zahlwoerter
    ? new Map(SPELLING_NUMBERS.map(([l, w]) => [l, w]))
    : new Map();
  return String(text ?? '')
    .toUpperCase()
    .split('')
    .filter((ch) => ch.trim() !== '')
    .map((ch) => buchstaben.get(ch) ?? ziffern.get(ch) ?? ch)
    .join(' ');
}

/** Setzt die Platzhalter in einer Zeile. */
export function fillPlaceholders(text, values) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = values[key];
    return v === undefined || v === null || v === '' ? `… (${key})` : String(v);
  });
}
