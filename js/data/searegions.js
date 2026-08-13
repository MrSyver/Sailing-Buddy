/**
 * Fertige Seegebiete zum Herunterladen.
 *
 * Ein Umkreis um die eigene Position ist gut, wenn man schon dort ist. Vor dem
 * Törn ist man das aber nicht – dann will man „Dänische Südsee“ antippen und
 * nicht erst einen Radius um einen Punkt legen, den man noch gar nicht kennt.
 *
 * Die Zuschnitte sind bewusst so gewählt, dass ein Gebiet in einem Rutsch
 * herunterladbar bleibt. Große Meere sind deshalb in Reviere unterteilt, wie
 * sie auch in den Seehandbüchern stehen. Wer mehr braucht, lädt zwei.
 *
 * `bounds` ist ein Rechteck in Grad. Es umschließt das Revier großzügig – über
 * Land geladene Kacheln sind ärgerlich, aber harmlos; fehlendes Wasser am Rand
 * wäre schlimmer.
 */

export const REGION_GROUPS = [
  { key: 'nordost', label: 'Nord- und Ostsee', labelEn: 'North Sea and Baltic' },
  { key: 'atlantik', label: 'Atlantik und Kanal', labelEn: 'Atlantic and Channel' },
  { key: 'mittelmeer', label: 'Mittelmeer', labelEn: 'Mediterranean' },
  { key: 'fern', label: 'Weiter weg', labelEn: 'Further afield' },
];

export const SEA_REGIONS = [
  // ----------------------------------------------------------- Nord- und Ostsee
  {
    id: 'deutsche-bucht',
    group: 'nordost',
    name: 'Deutsche Bucht',
    nameEn: 'German Bight',
    hint: 'Elbe, Weser, Jade, Ostfriesische und Nordfriesische Inseln',
    hintEn: 'Elbe, Weser, Jade, East and North Frisian Islands',
    bounds: { south: 53.3, north: 55.2, west: 6.2, east: 9.2 },
  },
  {
    id: 'nordsee-nl',
    group: 'nordost',
    name: 'Niederländische Küste',
    nameEn: 'Dutch coast',
    hint: 'Waddenzee, IJsselmeer, Ijmuiden bis Vlissingen',
    hintEn: 'Waddenzee, IJsselmeer, IJmuiden to Vlissingen',
    bounds: { south: 51.3, north: 53.6, west: 3.2, east: 6.4 },
  },
  {
    id: 'daenische-westkueste',
    group: 'nordost',
    name: 'Dänische Nordseeküste',
    nameEn: 'Danish North Sea coast',
    hint: 'Sylt bis Hanstholm, Limfjord',
    hintEn: 'Sylt to Hanstholm, Limfjord',
    bounds: { south: 54.8, north: 57.8, west: 7.6, east: 10.2 },
  },
  {
    id: 'skagerrak',
    group: 'nordost',
    name: 'Skagerrak und Kattegat',
    nameEn: 'Skagerrak and Kattegat',
    hint: 'Skagen, Göteborg, Oslofjord',
    hintEn: 'Skagen, Gothenburg, Oslofjord',
    bounds: { south: 56.0, north: 59.6, west: 7.8, east: 12.6 },
  },
  {
    id: 'kieler-bucht',
    group: 'nordost',
    name: 'Kieler Bucht und Dänische Südsee',
    nameEn: 'Kiel Bight and the Danish South Sea',
    hint: 'Kiel, Flensburg, Als, Fünen, Langeland, Ærø',
    hintEn: 'Kiel, Flensburg, Als, Funen, Langeland, Ærø',
    bounds: { south: 54.2, north: 55.6, west: 9.3, east: 11.5 },
  },
  {
    id: 'mecklenburger-bucht',
    group: 'nordost',
    name: 'Mecklenburger Bucht und Rügen',
    nameEn: 'Bay of Mecklenburg and Rügen',
    hint: 'Lübeck, Wismar, Warnemünde, Bodden, Usedom',
    hintEn: 'Lübeck, Wismar, Warnemünde, the Bodden, Usedom',
    bounds: { south: 53.8, north: 55.0, west: 10.6, east: 14.6 },
  },
  {
    id: 'oeresund',
    group: 'nordost',
    name: 'Øresund und Seeland',
    nameEn: 'Øresund and Zealand',
    hint: 'Kopenhagen, Malmö, Smålandsfarvandet',
    hintEn: 'Copenhagen, Malmö, Smålandsfarvandet',
    bounds: { south: 54.6, north: 56.4, west: 11.0, east: 13.3 },
  },
  {
    id: 'bornholm',
    group: 'nordost',
    name: 'Bornholm und Südschweden',
    nameEn: 'Bornholm and southern Sweden',
    hint: 'Christiansø, Simrishamn, Karlskrona, Öland',
    hintEn: 'Christiansø, Simrishamn, Karlskrona, Öland',
    bounds: { south: 54.6, north: 57.2, west: 13.0, east: 17.4 },
  },
  {
    id: 'danziger-bucht',
    group: 'nordost',
    name: 'Polnische Küste und Danziger Bucht',
    nameEn: 'Polish coast and Bay of Gdańsk',
    hint: 'Świnoujście, Kołobrzeg, Hel, Gdańsk',
    hintEn: 'Świnoujście, Kołobrzeg, Hel, Gdańsk',
    bounds: { south: 53.8, north: 55.2, west: 14.2, east: 19.8 },
  },
  {
    id: 'stockholm',
    group: 'nordost',
    name: 'Stockholmer Schären und Åland',
    nameEn: 'Stockholm archipelago and Åland',
    hint: 'Nynäshamn bis Öregrund, Mariehamn',
    hintEn: 'Nynäshamn to Öregrund, Mariehamn',
    bounds: { south: 58.6, north: 60.6, west: 17.2, east: 21.2 },
  },
  {
    id: 'finnischer-meerbusen',
    group: 'nordost',
    name: 'Finnischer Meerbusen',
    nameEn: 'Gulf of Finland',
    hint: 'Turku, Helsinki, Tallinn',
    hintEn: 'Turku, Helsinki, Tallinn',
    bounds: { south: 59.2, north: 60.8, west: 21.0, east: 27.0 },
  },
  {
    id: 'rigaer-bucht',
    group: 'nordost',
    name: 'Rigaer Bucht und Baltikum',
    nameEn: 'Gulf of Riga and the Baltic states',
    hint: 'Saaremaa, Riga, Klaipėda',
    hintEn: 'Saaremaa, Riga, Klaipėda',
    bounds: { south: 55.5, north: 59.0, west: 20.8, east: 24.6 },
  },

  // ----------------------------------------------------------- Atlantik / Kanal
  {
    id: 'aermelkanal',
    group: 'atlantik',
    name: 'Ärmelkanal',
    nameEn: 'English Channel',
    hint: 'Dover, Solent, Cherbourg, Kanalinseln',
    hintEn: 'Dover, the Solent, Cherbourg, Channel Islands',
    bounds: { south: 49.2, north: 51.4, west: -3.2, east: 2.2 },
  },
  {
    id: 'bretagne',
    group: 'atlantik',
    name: 'Bretagne und Biskaya-Nord',
    nameEn: 'Brittany and northern Biscay',
    hint: 'Ouessant, Morbihan, La Rochelle',
    hintEn: 'Ouessant, Morbihan, La Rochelle',
    bounds: { south: 45.6, north: 48.9, west: -5.6, east: -1.0 },
  },
  {
    id: 'irische-see',
    group: 'atlantik',
    name: 'Irische See',
    nameEn: 'Irish Sea',
    hint: 'Dublin, Isle of Man, Anglesey, Milford Haven',
    hintEn: 'Dublin, Isle of Man, Anglesey, Milford Haven',
    bounds: { south: 51.4, north: 55.0, west: -8.4, east: -3.0 },
  },
  {
    id: 'schottland',
    group: 'atlantik',
    name: 'Schottland und Hebriden',
    nameEn: 'Scotland and the Hebrides',
    hint: 'Clyde, Mull, Skye, Kaledonischer Kanal',
    hintEn: 'the Clyde, Mull, Skye, Caledonian Canal',
    bounds: { south: 55.0, north: 58.8, west: -8.0, east: -4.0 },
  },
  {
    id: 'galicien',
    group: 'atlantik',
    name: 'Galicien und Nordportugal',
    nameEn: 'Galicia and northern Portugal',
    hint: 'Rías Baixas, A Coruña, Porto',
    hintEn: 'Rías Baixas, A Coruña, Porto',
    bounds: { south: 41.0, north: 43.9, west: -9.6, east: -7.6 },
  },
  {
    id: 'algarve',
    group: 'atlantik',
    name: 'Algarve und Golf von Cádiz',
    nameEn: 'Algarve and Gulf of Cádiz',
    hint: 'Lissabon, Lagos, Cádiz, Gibraltar',
    hintEn: 'Lisbon, Lagos, Cádiz, Gibraltar',
    bounds: { south: 35.8, north: 39.0, west: -9.8, east: -5.2 },
  },
  {
    id: 'kanaren',
    group: 'atlantik',
    name: 'Kanarische Inseln',
    nameEn: 'Canary Islands',
    hint: 'Lanzarote bis El Hierro',
    hintEn: 'Lanzarote to El Hierro',
    bounds: { south: 27.4, north: 29.5, west: -18.4, east: -13.2 },
  },
  {
    id: 'madeira',
    group: 'atlantik',
    name: 'Madeira',
    nameEn: 'Madeira',
    hint: 'Funchal, Porto Santo, Ilhas Desertas',
    hintEn: 'Funchal, Porto Santo, Ilhas Desertas',
    bounds: { south: 32.3, north: 33.2, west: -17.4, east: -16.2 },
  },

  // ----------------------------------------------------------------- Mittelmeer
  {
    id: 'balearen',
    group: 'mittelmeer',
    name: 'Balearen',
    nameEn: 'Balearic Islands',
    hint: 'Mallorca, Menorca, Ibiza, Formentera',
    hintEn: 'Mallorca, Menorca, Ibiza, Formentera',
    bounds: { south: 38.5, north: 40.2, west: 1.1, east: 4.4 },
  },
  {
    id: 'costa-brava',
    group: 'mittelmeer',
    name: 'Katalonien und Costa Brava',
    nameEn: 'Catalonia and the Costa Brava',
    hint: 'Barcelona, Palamós, Roses',
    hintEn: 'Barcelona, Palamós, Roses',
    bounds: { south: 40.5, north: 42.5, west: 0.6, east: 3.4 },
  },
  {
    id: 'cote-dazur',
    group: 'mittelmeer',
    name: "Côte d'Azur und Ligurien",
    nameEn: 'Côte d’Azur and Liguria',
    hint: 'Marseille, Saint-Tropez, Nizza, Genua',
    hintEn: 'Marseille, Saint-Tropez, Nice, Genoa',
    bounds: { south: 42.8, north: 44.4, west: 4.8, east: 9.6 },
  },
  {
    id: 'korsika-sardinien',
    group: 'mittelmeer',
    name: 'Korsika und Sardinien',
    nameEn: 'Corsica and Sardinia',
    hint: 'Bonifacio, Maddalena, Costa Smeralda, Cagliari',
    hintEn: 'Bonifacio, La Maddalena, Costa Smeralda, Cagliari',
    bounds: { south: 38.8, north: 43.1, west: 8.0, east: 10.0 },
  },
  {
    id: 'sizilien',
    group: 'mittelmeer',
    name: 'Sizilien, Äolische Inseln und Malta',
    nameEn: 'Sicily, Aeolian Islands and Malta',
    hint: 'Palermo, Lipari, Messina, Syrakus, Valletta',
    hintEn: 'Palermo, Lipari, Messina, Syracuse, Valletta',
    bounds: { south: 35.7, north: 38.9, west: 11.8, east: 15.8 },
  },
  {
    id: 'neapel',
    group: 'mittelmeer',
    name: 'Golf von Neapel und Toskana',
    nameEn: 'Bay of Naples and Tuscany',
    hint: 'Elba, Ponza, Capri, Amalfi',
    hintEn: 'Elba, Ponza, Capri, Amalfi',
    bounds: { south: 40.4, north: 43.1, west: 9.8, east: 15.2 },
  },
  {
    id: 'adria-nord',
    group: 'mittelmeer',
    name: 'Nördliche Adria und Istrien',
    nameEn: 'Northern Adriatic and Istria',
    hint: 'Venedig, Triest, Pula, Kvarner, Zadar',
    hintEn: 'Venice, Trieste, Pula, Kvarner, Zadar',
    bounds: { south: 43.6, north: 45.9, west: 12.2, east: 16.2 },
  },
  {
    id: 'adria-sued',
    group: 'mittelmeer',
    name: 'Dalmatien und südliche Adria',
    nameEn: 'Dalmatia and the southern Adriatic',
    hint: 'Šibenik, Split, Hvar, Korčula, Dubrovnik, Kotor',
    hintEn: 'Šibenik, Split, Hvar, Korčula, Dubrovnik, Kotor',
    bounds: { south: 41.8, north: 44.0, west: 15.0, east: 19.2 },
  },
  {
    id: 'ionisch',
    group: 'mittelmeer',
    name: 'Ionische Inseln',
    nameEn: 'Ionian Islands',
    hint: 'Korfu, Lefkas, Ithaka, Kefalonia',
    hintEn: 'Corfu, Lefkas, Ithaca, Kefalonia',
    bounds: { south: 37.4, north: 39.9, west: 19.2, east: 21.4 },
  },
  {
    id: 'saronisch',
    group: 'mittelmeer',
    name: 'Saronischer Golf und Peloponnes',
    nameEn: 'Saronic Gulf and the Peloponnese',
    hint: 'Athen, Ägina, Hydra, Nafplio',
    hintEn: 'Athens, Aegina, Hydra, Nafplio',
    bounds: { south: 36.3, north: 38.3, west: 21.4, east: 24.2 },
  },
  {
    id: 'kykladen',
    group: 'mittelmeer',
    name: 'Kykladen',
    nameEn: 'Cyclades',
    hint: 'Paros, Naxos, Mykonos, Santorin',
    hintEn: 'Paros, Naxos, Mykonos, Santorini',
    bounds: { south: 36.2, north: 38.0, west: 24.0, east: 26.2 },
  },
  {
    id: 'dodekanes',
    group: 'mittelmeer',
    name: 'Dodekanes und türkische Küste',
    nameEn: 'Dodecanese and the Turkish coast',
    hint: 'Kos, Rhodos, Bodrum, Marmaris, Göcek',
    hintEn: 'Kos, Rhodes, Bodrum, Marmaris, Göcek',
    bounds: { south: 35.8, north: 37.6, west: 26.4, east: 29.4 },
  },

  // ------------------------------------------------------------------ Weiter weg
  {
    id: 'kleine-antillen',
    group: 'fern',
    name: 'Kleine Antillen',
    nameEn: 'Lesser Antilles',
    hint: 'Antigua, Guadeloupe, Martinique, St. Lucia, Grenada',
    hintEn: 'Antigua, Guadeloupe, Martinique, St Lucia, Grenada',
    bounds: { south: 11.8, north: 18.6, west: -63.4, east: -59.8 },
  },
  {
    id: 'bahamas',
    group: 'fern',
    name: 'Bahamas',
    nameEn: 'Bahamas',
    hint: 'Abacos, Exumas, Nassau',
    hintEn: 'Abacos, Exumas, Nassau',
    bounds: { south: 22.6, north: 27.4, west: -79.4, east: -73.8 },
  },
  {
    id: 'kapverden',
    group: 'fern',
    name: 'Kapverden',
    nameEn: 'Cape Verde',
    hint: 'Mindelo, Sal, Praia',
    hintEn: 'Mindelo, Sal, Praia',
    bounds: { south: 14.7, north: 17.3, west: -25.5, east: -22.6 },
  },
  {
    id: 'norwegen-sued',
    group: 'fern',
    name: 'Norwegen Süd',
    nameEn: 'Southern Norway',
    hint: 'Stavanger, Bergen, Sognefjord, Ålesund',
    hintEn: 'Stavanger, Bergen, Sognefjord, Ålesund',
    bounds: { south: 58.6, north: 63.0, west: 4.4, east: 8.0 },
  },
  {
    id: 'helgeland',
    group: 'fern',
    name: 'Helgeland',
    nameEn: 'Helgeland',
    hint: 'Trondheim, Rørvik, Sandnessjøen, Bodø',
    hintEn: 'Trondheim, Rørvik, Sandnessjøen, Bodø',
    bounds: { south: 63.2, north: 67.4, west: 8.0, east: 14.6 },
  },
  {
    id: 'lofoten',
    group: 'fern',
    name: 'Lofoten und Vesterålen',
    nameEn: 'Lofoten and Vesterålen',
    hint: 'Svolvær, Reine, Andenes, Harstad',
    hintEn: 'Svolvær, Reine, Andenes, Harstad',
    bounds: { south: 67.3, north: 69.4, west: 12.0, east: 16.6 },
  },
];

/** Ein Gebiet in der Form, die die Kachelrechnung erwartet. */
export function regionArea(region, zMin, zMax) {
  return {
    kind: 'bounds', bounds: region.bounds, zMin, zMax,
  };
}

/** Liegt eine Position in diesem Gebiet? */
export function regionContains(region, pos) {
  if (!pos) return false;
  const b = region.bounds;
  return pos.lat >= b.south && pos.lat <= b.north && pos.lon >= b.west && pos.lon <= b.east;
}

/** Grober Mittelpunkt – für die Entfernungsangabe in der Liste. */
export function regionCenter(region) {
  const b = region.bounds;
  return { lat: (b.north + b.south) / 2, lon: (b.east + b.west) / 2 };
}
