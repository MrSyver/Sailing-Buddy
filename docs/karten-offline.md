# Sind Offline-Karten möglich?

Kurz: **technisch ja, rechtlich nur eingeschränkt.** Die Abwägung darunter ist
das ursprüngliche Papier zur Frage. Die Empfehlung am Ende ist inzwischen
umgesetzt – hier steht, wie.

## Was davon umgesetzt ist

Genau die ersten beiden Stufen der Empfehlung, in dieser Reihenfolge:

1. **Plot ohne Kartendaten.** Der Reiter „Karte“ zeichnet die eigene Position,
   jede gemerkte Position und die Spur aus dem Logbuch – nordorientiert, mit
   Maßstabsbalken, ohne jedes Kartenmaterial. Das läuft überall auf der Welt
   und braucht keinen Speicherplatz.
2. **Optionales OpenSeaMap-Paket.** Das Kartenbild ist ein zuschaltbarer
   Hintergrund, kein Normalzustand. Es zeigt ausschließlich Kacheln, die unter
   „Einstellungen → Karten“ ausdrücklich heruntergeladen wurden; aus dem
   Kartenmodul heraus wird nie etwas aus dem Netz geholt. Fehlt ein Ausschnitt,
   bleibt die Fläche leer und sagt das auch.
3. Amtliche Karten bleiben in der App des Kartenherstellers. Daran ändert sich
   nichts.

Die Schonung des fremden Kachelservers ist Teil der Umsetzung: höchstens 4000
Abrufe je Vorgang, einzeln und mit Pause, und eine austauschbare Adresse für
alle, die regelmäßig größere Gebiete mitnehmen. `js/data/tilesources.js` ist
die einzige Datei der App, in der Adressen fremder Server stehen dürfen.

## Warum lange keine Karte drin war

Die App rechnet mit Geometrie statt mit Kartenbildern: Entfernung, Kurs,
Gegenkurs und Fahrzeit ergeben sich allein aus zwei Koordinaten. Das ist
robust, braucht kein Netz, keinen Speicherplatz und keine Lizenz – und es
funktioniert an jedem Punkt der Erde gleich gut.

Eine Karte macht die Anzeige anschaulicher, verleitet aber dazu, ihr zu
vertrauen. Genau das ist bei nicht-amtlichem Kartenmaterial gefährlich.

## Was ginge

### 1. OpenStreetMap und OpenSeaMap

Frei nutzbar unter der ODbL, Namensnennung erforderlich. OpenSeaMap liefert
zusätzlich Seezeichen, Leuchtfeuer, Hafeninformationen.

Für den Offline-Betrieb werden die Kacheln vorab heruntergeladen und im Gerät
abgelegt – am saubersten als **PMTiles**: eine einzige Datei, aus der der
Browser über Bereichsabfragen einzelne Kacheln liest. Zusammen mit
MapLibre GL JS lässt sich das vollständig statisch betreiben, ohne
Kartenserver.

Grobe Größenordnungen für ein Küstengebiet wie die westliche Ostsee:

| Zoomstufen | Art | ungefähre Größe |
|---|---|---|
| 0–10 | Übersicht | einige MB |
| 0–13 | brauchbar zur Orientierung | einige zehn MB |
| 0–15 | Details bis in die Hafeneinfahrt | mehrere hundert MB |

Das sind Anhaltswerte, keine gemessenen Zahlen – die tatsächliche Größe hängt
stark vom Zuschnitt ab.

### 2. Amtliche Seekarten

BSH, NV Charts, Navionics und Vergleichbares sind lizenzpflichtig, teils
verschlüsselt (S-63). Sie dürfen nicht mitgeliefert oder in eine eigene App
eingebettet werden. Wer sie nutzen will, nutzt sie in der App des jeweiligen
Anbieters.

Freie amtliche Vektordaten gibt es regional: Die NOAA gibt ihre ENCs für
US-Gewässer gemeinfrei heraus. Für europäische Gewässer existiert nichts
Vergleichbares.

### 3. Was sich ohne jede Karte lohnt

Vieles vom Nutzen einer Karte lässt sich ohne Kartendaten nachbauen:

* eine Plot-Ansicht, die eigene Position, Ziel und Kurslinie maßstäblich
  zeigt – nordorientiert, ohne Hintergrund;
* eine Spur der letzten Stunden aus den GPS-Fixes;
* eigene Wegpunkte und Hafenkoordinaten, die man einmal einträgt.

Das läuft offline, braucht ein paar Kilobyte und kann nichts vortäuschen, was
es nicht weiß.

## Was auf dem iPhone dagegen spricht

* **Speicher.** Der Browser verwaltet den Platz selbst. Ohne
  `navigator.storage.persist()` darf iOS abgelegte Daten wieder wegräumen,
  wenn es eng wird – ausgerechnet die hundert Megabyte Kartenpaket sind der
  erste Kandidat.
* **Der Download muss vorher passieren.** Kartenpakete zieht man an Land im
  WLAN, nicht auf See. Das braucht einen sichtbaren Verwaltungsschritt:
  Gebiet wählen, Größe anzeigen, laden, später wieder löschen.
* **Erwartungshaltung.** Eine Karte, die aussieht wie eine Seekarte, aber
  keine ist, ist gefährlicher als gar keine Karte. Untiefen, Sperrgebiete und
  Betonnung sind in OpenStreetMap unvollständig und nicht amtlich gepflegt.

## Empfehlung (umgesetzt)

Die sicherheitsrelevanten Module so lassen, wie sie sind – sie sollen nie an
fehlenden Kartendaten scheitern. Deshalb steht die Karte neben ihnen und nicht
unter ihnen.

Wenn eine bildliche Darstellung gewünscht ist, in dieser Reihenfolge:

1. **Plot ohne Kartendaten** (Position, Ziel, Kurslinie, Spur). Kleiner
   Aufwand, kein Speicherbedarf, keine Lizenzfrage, keine Irreführung.
2. **Optionales OpenSeaMap-Paket** als eigener, deutlich als „nicht zur
   Navigation“ gekennzeichneter Reiter, mit ausdrücklichem Download durch die
   Nutzerin oder den Nutzer.
3. Amtliche Karten bleiben in der App des Kartenherstellers.
