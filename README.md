# Sailing Buddy

Offline-Helfer für Segler. Läuft im Browser, lässt sich als App auf den
Home-Bildschirm legen und braucht danach kein Netz mehr – nur GPS.

Drei Module:

| Modul | Was es kann |
|---|---|
| **Funk** | Die wichtigsten Funksprüche mit bereits eingesetztem Schiffsnamen, Rufzeichen, MMSI und aktueller GPS-Position. Zum Vorlesen, in Deutsch oder Englisch. Häufige Notfälle auf Antippen einsetzbar. Dazu Sprachaufnahmen für empfangene Meldungen. |
| **Position** | Zielkoordinate in reinen Zahlenfeldern eingeben – ohne Gradzeichen und Hochkomma – und Entfernung, rechtweisenden Kurs, Kompasskurs und Fahrzeit ablesen. MOB-Taste mit gemerkter Position. |
| **Nachtfahrt** | Lichterführung, Seezeichen und Schallsignale nach KVR und IALA. Die Lichtersuche geht über Fahrzeuge und Tonnen zugleich und bietet nach jeder Auswahl nur noch an, was überhaupt möglich ist. Jede Feuerkennung als Balken. |
| **Logbuch** | Positionen von Hand oder in festem Takt mitschreiben, als Spur zeichnen, als Text oder Tabelle ausgeben. |

Dazu ein **Nachtmodus**, der ausschließlich langwelliges Rot auf Schwarz
verwendet, und ein Dimmer, der weiter herunterregelt als iOS allein.

---

## Auf iPhone und iPad installieren

Die App wird nicht über den App Store verteilt, sondern über den Browser
installiert. Voraussetzung ist eine HTTPS-Adresse – deshalb der Umweg über
GitHub Pages.

### Einmalig: veröffentlichen

1. **Settings → Pages** öffnen und unter *Build and deployment* als *Source*
   **GitHub Actions** auswählen.

   Dieser Klick ist einmalig nötig und lässt sich nicht automatisieren: Der
   `GITHUB_TOKEN` eines Workflows darf eine Pages-Seite nicht anlegen. Fehlt
   der Schritt, bricht der Lauf mit *„Create Pages site failed – Resource not
   accessible by integration“* ab.

2. Nach `main` mergen (oder den Workflow unter *Actions* von Hand starten).
   `.github/workflows/pages.yml` fährt alle Prüfungen, stellt die Website
   zusammen, prüft sie noch einmal im Browser – samt Kaltstart ohne Netz –
   und veröffentlicht sie erst dann.

3. Nach ein bis zwei Minuten liegt die App unter
   `https://mrsyver.github.io/Sailing-Buddy/`.

### Auf dem Gerät

1. Die Adresse **in Safari** öffnen. Nicht in Chrome oder Firefox – nur Safari
   darf unter iOS Web-Apps auf den Home-Bildschirm legen.
2. Auf **Teilen** tippen (Quadrat mit Pfeil nach oben).
3. **Zum Home-Bildschirm** wählen, Namen bestätigen.
4. Die App einmal vom Home-Bildschirm starten, solange noch Netz da ist.
   Dabei lädt sie sich vollständig ins Gerät.
5. Beim ersten Öffnen des Reiters „Position“ fragt iOS nach dem Standort.
   **Beim Verwenden der App erlauben** wählen.

Ab jetzt läuft alles offline, auch im Flugmodus.

---

## Wie „offline“ hier gemeint ist

Einmal muss die App auf das Gerät kommen. Das gilt für jede App, auch für
solche aus dem App Store. Alles danach passiert ohne Verbindung:

* Die App **startet immer aus dem Gerät**. Beim Start wird nicht einmal
  versucht, das Netz zu erreichen – es gibt also auch keine Wartezeit, kein
  Hängen an einem schlechten Hotspot und keinen Unterschied zwischen Hafen und
  offener See.
* Sie **läuft nicht ab**. Es gibt keine Gültigkeitsdauer, keinen Abgleich,
  keine Anmeldung.
* Sie lädt **nichts nach**. Keine Schriften, keine Programmbibliotheken, keine
  Karten, keine Auswertung. Ein Test wacht darüber, dass sich nie ein Verweis
  auf einen fremden Server einschleicht.
* Die Installation ist **ganz oder gar nicht**. Fehlt beim Ablegen auch nur
  eine Datei, gilt sie als gescheitert und der bisherige Stand bleibt
  bestehen. Ein halb gefüllter Speicher wäre schlimmer als keiner – er fällt
  erst auf See auf.

### Nachweis statt Vertrauen

Unter **Einstellungen → Offline-Bereitschaft** steht schwarz auf weiß, ob
wirklich jede Datei im Gerät liegt, wie viel Platz sie belegt und ob der
Speicher als *dauerhaft* gekennzeichnet ist. Ohne diese Kennzeichnung dürfte
das Betriebssystem die Kopie bei Platzmangel wegräumen; die App fordert sie
deshalb beim ersten Start an. Fehlt etwas, erscheint eine Warnung im Kopf der
App und ein Knopf „Offline-Kopie erneuern“ – nicht erst dann, wenn es zu spät
ist.

Vor dem Ablegen: einmal in den Flugmodus schalten und die App vom
Home-Bildschirm starten. Wenn sie kommt, kommt sie immer.

### Rückfallebene: alles in einer Datei

Für den Fall, dass iOS die Kopie doch einmal entfernt, während keine
Verbindung da ist, gibt es die ganze App als **eine einzige HTML-Datei**:

```
https://mrsyver.github.io/Sailing-Buddy/dist/sailing-buddy.html
```

Rund 200 kB, ohne weitere Bestandteile. In „Dateien“ oder iCloud Drive legen,
und sie lässt sich jederzeit direkt öffnen – ohne Server, ohne Netz, auch von
einem USB-Stick oder per AirDrop von einem Rechner. Selbst bauen:

```bash
npm run build:single      # erzeugt dist/sailing-buddy.html
```

Das ist die Reserve, nicht der Hauptweg: Aus einer lokalen Datei heraus geben
Browser den Standort je nach Fassung nicht frei. Funksprüche, Lichter und
Schallsignale funktionieren dort in jedem Fall, die Position wird dann von
Hand eingetragen.

### Was auf welchem Gerät funktioniert

| Gerät | GPS ohne Netz |
|---|---|
| iPhone | ja, eingebauter Empfänger |
| iPad mit Mobilfunk (Cellular) | ja, eingebauter Empfänger |
| iPad nur mit WLAN | **nein** – kein GPS-Chip verbaut. Position im Modul „Position“ von Hand eintragen oder ein externes GPS über Bluetooth koppeln. |

Ohne Mobilfunkverbindung fehlen dem Empfänger die Hilfsdaten, deshalb dauert
der erste Fix ein bis zwei Minuten. Freie Sicht zum Himmel hilft, unter Deck
wird das nichts.

---

## Örtlich ausprobieren

```bash
npm start          # startet einen Webserver auf http://localhost:8080
```

Am Rechner reicht `localhost` auch für den Service Worker. Auf dem iPhone
funktioniert die Installation nur über HTTPS.

---

## Aufbau

Kein Bauschritt, keine Laufzeit-Abhängigkeiten. Was im Verzeichnis liegt,
läuft im Browser. Gebaut wird nur die optionale Einzeldatei – die App selbst
bleibt davon unberührt.

```
index.html               App-Hülle, iOS-Metaangaben
manifest.webmanifest     Angaben für die Installation
sw.js                    Service Worker – legt alles für den Offline-Betrieb ab
css/style.css            Gestaltung, drei Farbschemata samt Nachtmodus
js/app.js                Reiter, Kopfzeile, GPS-Leiste
js/lib/geo.js            Navigationsrechnung und Koordinaten-Erkennung
js/lib/gps.js            Geolocation
js/lib/i18n.js           Sprache der Oberfläche
js/lib/logbook.js        Logbuch samt automatischem Takt und Spurberechnung
js/lib/offline.js        prüft und sichert die Offline-Bereitschaft
js/lib/recorder.js       Sprachaufnahmen (IndexedDB)
js/lib/storage.js        Einstellungen und Wegpunkte (bleiben auf dem Gerät)
js/lib/theme.js          Farbschema und Dimmer
js/lib/audio.js          erzeugt die Schallsignale im Gerät
js/lib/dom.js            kleine Helfer statt Framework
js/views/                die fünf Module
js/data/                 Funksprüche, Lichterführung, Seezeichen, Schallsignale
tools/make-icons.py      erzeugt die App-Symbole
tools/build-single-file.mjs  baut dist/sailing-buddy.html
tools/smoke.mjs          Rauchtest im echten Browser
tests/geo.test.mjs       Prüfungen der Navigationsrechnung
tests/offline.test.mjs   wacht über die Vollständigkeit der Offline-Kopie
```

### Sprachen

Zwei Einstellungen, bewusst getrennt:

* **Sprache der App** (Einstellungen) – Menüs, Beschriftungen, Hinweise.
* **Sprache der Funksprüche** (im Funk-Modul) – der vorzulesende Text.

So kann die Oberfläche deutsch bleiben, während der Notruf auf Englisch
abgesetzt wird.

---

## Prüfen

```bash
npm test                                  # 30 Prüfungen: Navigation und Offline-Kopie
npm run smoke                             # 92 Prüfungen im echten Browser
node tools/smoke.mjs --shots              # zusätzlich Bildschirmfotos
```

`npm test` prüft die Navigationsrechnung und wacht darüber, dass die
Offline-Liste des Service Workers zu den tatsächlich vorhandenen Dateien passt
und sich nirgends ein Verweis auf einen fremden Server einschleicht.

Der Rauchtest startet die App in einem echten Chromium mit vorgegebener
GPS-Position, klappert alle Module ab, schaltet beide Sprachen getrennt um,
prüft die Farben des Nachtmodus – und am Ende den harten Fall: **Seite
geschlossen, Webserver abgeschaltet, Netz getrennt, neuer Tab.** Was dann noch
startet, startet wirklich aus dem Gerät. Zuletzt wird die Einzeldatei direkt
von der Platte geöffnet. Playwright ist dafür als Entwicklungsabhängigkeit
nötig, für den Betrieb der App nicht.

Nutzt das System schon ein Chromium, lässt es sich angeben:

```bash
CHROMIUM_PATH=/opt/pw-browsers/chromium node tools/smoke.mjs
```

Die App-Symbole werden aus einer Beschreibung im Skript gezeichnet, ein
Bildbearbeitungsprogramm ist nicht nötig:

```bash
npm run icons
```

---

## Datenschutz

Schiffsdaten, Wegpunkte und Einstellungen liegen ausschließlich im Gerät
(`localStorage`). Es gibt keinen Server, kein Konto und keine Übertragung.
Unter *Einstellungen → Datensicherung* lässt sich alles als Text kopieren und
später wieder einlesen – sinnvoll vor einem Gerätewechsel.

---

## Zum Umfang

Sailing Buddy ist eine Gedächtnisstütze für Törnvorbereitung und Wache.

Die Inhalte folgen den Kollisionsverhütungsregeln (KVR/COLREG) und den
üblichen Seefunkverfahren, ersetzen aber weder Ausbildung und Funkzeugnis noch
amtliche Seekarten und Nachrichten für Seefahrer. Die Navigationsrechnung
arbeitet mit einem Kugelmodell der Erde – für Küstennavigation völlig
ausreichend, aber die Papierseekarte und die zugelassene Bordausrüstung
bleiben maßgeblich.

Karten sind bewusst nicht enthalten. Warum, steht in
[docs/karten-offline.md](docs/karten-offline.md).
