/**
 * Kartenquellen.
 *
 * Die einzige Stelle der App, an der Adressen fremder Server stehen. Alles
 * andere lädt ausschließlich aus dem Gerät – darüber wacht tests/offline.test.mjs.
 *
 * Zur Nutzung, in aller Deutlichkeit:
 *
 * Der Kachelserver von OpenStreetMap wird von Spenden getragen und ist
 * ausdrücklich nicht für Massenabrufe gedacht. Das Herunterladen ganzer
 * Seegebiete gehört dort nicht hin. Deshalb:
 *   - sind die Mengen je Bereich hart begrenzt,
 *   - laufen die Abrufe einzeln und mit Pause,
 *   - lässt sich die Adresse der Grundkarte austauschen.
 *
 * Wer regelmäßig größere Gebiete mitnimmt, sollte einen eigenen Kachelserver
 * betreiben oder einen Anbieter mit Zugangsschlüssel eintragen. Das Feld dafür
 * steht in den Einstellungen.
 *
 * Der Seezeichen-Layer von OpenSeaMap ist durchsichtig und enthält Tonnen,
 * Leuchtfeuer, Hafeninformationen. Er wird über die Grundkarte gelegt.
 */

export const DEFAULT_BASE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const DEFAULT_SEAMARK_URL = 'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png';

/** Namensnennung – muss auf der Karte sichtbar sein. */
export const ATTRIBUTION = '© OpenStreetMap-Mitwirkende · OpenSeaMap (CC BY-SA 2.0)';

/** Die beiden Ebenen, aus denen sich die Karte zusammensetzt. */
export function layers(settings) {
  return [
    {
      id: 'base',
      url: settings.tileBaseUrl || DEFAULT_BASE_URL,
      label: 'Grundkarte',
      labelEn: 'Base map',
    },
    {
      id: 'seamark',
      url: settings.tileSeamarkUrl || DEFAULT_SEAMARK_URL,
      label: 'Seezeichen',
      labelEn: 'Seamarks',
    },
  ];
}

/** Sinnvolle Zoomstufen für die Küstennavigation. */
export const ZOOM_PRESETS = [
  { zMin: 8, zMax: 11, label: 'Übersicht', labelEn: 'Overview', hint: 'grobe Orientierung' },
  { zMin: 8, zMax: 13, label: 'Küste', labelEn: 'Coastal', hint: 'Standard für den Törn' },
  { zMin: 8, zMax: 15, label: 'Hafen', labelEn: 'Harbour', hint: 'bis in die Hafeneinfahrt' },
];

/** Auswählbare Radien um die eigene Position, in Seemeilen. */
export const RADIUS_OPTIONS = [5, 10, 20, 40];

/** Auswählbare Korridorbreiten entlang einer Route, in Seemeilen. */
export const CORRIDOR_OPTIONS = [2, 5, 10];
