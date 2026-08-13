/**
 * Fertige Kartenpakete von OpenSeaMap.
 *
 * OpenSeaMap stellt seine Karten als MBTiles bereit – ein Paket je Seegebiet,
 * über einen Dateispiegel, der für große Downloads gedacht ist. Das ist der
 * Weg, den das Projekt selbst dafür vorsieht, im Gegensatz zum Kachelserver.
 *
 * ZUR EHRLICHKEIT: Die Adresse des Spiegels und die genauen Dateinamen konnte
 * ich beim Bauen nicht nachprüfen – die Umgebung, in der dieser Code entstand,
 * kommt an keinen der beiden Server heran. Die Angaben unten sind der Stand
 * aus der Beschreibung des Projekts, die Größen sind gerundete Anhaltswerte.
 *
 * Deshalb ist alles hier austauschbar:
 *   - die Grundadresse steht in den Einstellungen,
 *   - jeder Eintrag lässt sich mit einer eigenen Adresse überschreiben,
 *   - und es gibt ein Feld für eine beliebige eigene MBTiles-Adresse.
 *
 * Stimmt ein Dateiname nicht, sagt der Download das beim ersten Versuch
 * ("Der Server antwortet mit 404") und man trägt die richtige Adresse ein.
 * Nichts davon macht die App unbrauchbar.
 */

/** Verzeichnis, unter dem die Pakete liegen. In den Einstellungen änderbar. */
export const DEFAULT_PACK_BASE = 'https://ftp5.gwdg.de/pub/misc/openseamap/mbtiles/';

export const PACK_ATTRIBUTION = '© OpenSeaMap und OpenStreetMap-Mitwirkende (CC BY-SA 2.0)';

/**
 * `bytes` ist eine Schätzung für die Anzeige vor dem Download, keine Zusage.
 * Die tatsächliche Größe steht in der Antwort des Servers und wird von da an
 * verwendet.
 */
export const CHART_PACKS = [
  {
    id: 'baltic',
    file: 'Baltic_Sea.mbtiles',
    name: 'Ostsee',
    nameEn: 'Baltic Sea',
    hint: 'Kattegat bis Bottnischer Meerbusen, Bodden und Schären',
    hintEn: 'Kattegat to the Gulf of Bothnia, the Bodden and the archipelagos',
    bytes: 400 * 1024 * 1024,
    group: 'nordost',
  },
  {
    id: 'north-sea',
    file: 'North_Sea.mbtiles',
    name: 'Nordsee',
    nameEn: 'North Sea',
    hint: 'Deutsche Bucht, Wattenmeer, dänische und norwegische Küste',
    hintEn: 'German Bight, the Wadden Sea, Danish and Norwegian coasts',
    bytes: 550 * 1024 * 1024,
    group: 'nordost',
  },
  {
    id: 'dutch-inland',
    file: 'Dutch_Inland_Waters.mbtiles',
    name: 'Niederländische Binnengewässer',
    nameEn: 'Dutch inland waters',
    hint: 'IJsselmeer, Friesische Seen, Staande Mastroute',
    hintEn: 'IJsselmeer, the Frisian lakes, Staande Mastroute',
    bytes: 120 * 1024 * 1024,
    group: 'nordost',
  },
  {
    id: 'channel',
    file: 'British_Channel.mbtiles',
    name: 'Ärmelkanal',
    nameEn: 'English Channel',
    hint: 'Dover, Solent, Kanalinseln, bretonische Nordküste',
    hintEn: 'Dover, the Solent, Channel Islands, north Brittany',
    bytes: 300 * 1024 * 1024,
    group: 'atlantik',
  },
  {
    id: 'biscay',
    file: 'Gulf_of_Biscay.mbtiles',
    name: 'Biskaya',
    nameEn: 'Bay of Biscay',
    hint: 'Bretagne, französische Atlantikküste, Nordspanien',
    hintEn: 'Brittany, the French Atlantic coast, northern Spain',
    bytes: 300 * 1024 * 1024,
    group: 'atlantik',
  },
  {
    id: 'north-atlantic',
    file: 'North_Atlantic.mbtiles',
    name: 'Nordatlantik',
    nameEn: 'North Atlantic',
    hint: 'Für die Überfahrt – grob, aber flächendeckend',
    hintEn: 'For the crossing – coarse, but everywhere',
    bytes: 500 * 1024 * 1024,
    group: 'atlantik',
  },
  {
    id: 'med-west',
    file: 'Mediterranean_Sea_West.mbtiles',
    name: 'Mittelmeer West',
    nameEn: 'Western Mediterranean',
    hint: 'Balearen, Côte d’Azur, Korsika, Sardinien, Sizilien',
    hintEn: 'Balearics, Côte d’Azur, Corsica, Sardinia, Sicily',
    bytes: 450 * 1024 * 1024,
    group: 'mittelmeer',
  },
  {
    id: 'med-east',
    file: 'Mediterranean_Sea_East.mbtiles',
    name: 'Mittelmeer Ost',
    nameEn: 'Eastern Mediterranean',
    hint: 'Ionisches Meer, Ägäis, türkische Küste, Zypern',
    hintEn: 'Ionian Sea, the Aegean, the Turkish coast, Cyprus',
    bytes: 450 * 1024 * 1024,
    group: 'mittelmeer',
  },
  {
    id: 'adriatic',
    file: 'Adriatic.mbtiles',
    name: 'Adria',
    nameEn: 'Adriatic',
    hint: 'Istrien, Kvarner, Dalmatien, Montenegro',
    hintEn: 'Istria, Kvarner, Dalmatia, Montenegro',
    bytes: 250 * 1024 * 1024,
    group: 'mittelmeer',
  },
  {
    id: 'caribbean',
    file: 'Caribbean.mbtiles',
    name: 'Karibik',
    nameEn: 'Caribbean',
    hint: 'Kleine und Große Antillen',
    hintEn: 'Lesser and Greater Antilles',
    bytes: 400 * 1024 * 1024,
    group: 'fern',
  },
];

export const PACK_GROUPS = [
  { key: 'nordost', label: 'Nord- und Ostsee', labelEn: 'North Sea and Baltic' },
  { key: 'atlantik', label: 'Atlantik und Kanal', labelEn: 'Atlantic and Channel' },
  { key: 'mittelmeer', label: 'Mittelmeer', labelEn: 'Mediterranean' },
  { key: 'fern', label: 'Weiter weg', labelEn: 'Further afield' },
];

/** Die vollständige Adresse eines Pakets, mit den Einstellungen des Geräts. */
export function packUrl(pack, settings = {}) {
  const override = settings.packUrls?.[pack.id];
  if (override) return override;
  const base = settings.packBaseUrl || DEFAULT_PACK_BASE;
  return `${base.replace(/\/+$/, '')}/${pack.file}`;
}
