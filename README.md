# Sailing Buddy

Offline-Helfer für Segler. Läuft im Browser, lässt sich als App auf den
Home-Bildschirm legen und braucht danach kein Netz mehr – nur GPS.

Drei Module:

| Modul | Was es kann |
|---|---|
| **Funk** | Die wichtigsten Funksprüche mit bereits eingesetztem Schiffsnamen, Rufzeichen, MMSI und aktueller GPS-Position. Zum Vorlesen, in Deutsch oder Englisch. |
| **Position** | Eine Position eingeben – etwa aus einem Notruf – und Entfernung, rechtweisenden Kurs, Kompasskurs und Fahrzeit dorthin ablesen. |
| **Nachtfahrt** | Lichterführung und Schallsignale nach den Kollisionsverhütungsregeln, mit Farbfilter „Was sehe ich?“ und hörbaren Signalen. |

Dazu ein **Nachtmodus**, der ausschließlich langwelliges Rot auf Schwarz
verwendet, und ein Dimmer, der weiter herunterregelt als iOS allein.

---

## Auf iPhone und iPad installieren

Die App wird nicht über den App Store verteilt, sondern über den Browser
installiert. Voraussetzung ist eine HTTPS-Adresse – deshalb der Umweg über
GitHub Pages.

### Einmalig: veröffentlichen

1. Im Repository **Settings → Pages** öffnen.
2. Unter *Build and deployment* als *Source* **GitHub Actions** auswählen.
3. Den Branch nach `main` mergen. Der Workflow `.github/workflows/pages.yml`
   prüft die Navigationsrechnung und veröffentlicht anschließend.
4. Nach ein bis zwei Minuten liegt die App unter
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
läuft im Browser.

```
index.html               App-Hülle, iOS-Metaangaben
manifest.webmanifest     Angaben für die Installation
sw.js                    Service Worker – legt alles für den Offline-Betrieb ab
css/style.css            Gestaltung, drei Farbschemata samt Nachtmodus
js/app.js                Reiter, Kopfzeile, GPS-Leiste
js/lib/geo.js            Navigationsrechnung und Koordinaten-Erkennung
js/lib/gps.js            Geolocation
js/lib/i18n.js           Sprache der Oberfläche
js/lib/storage.js        Einstellungen und Wegpunkte (bleiben auf dem Gerät)
js/lib/theme.js          Farbschema und Dimmer
js/lib/audio.js          erzeugt die Schallsignale im Gerät
js/lib/dom.js            kleine Helfer statt Framework
js/views/                die vier Module
js/data/                 Funksprüche, Lichterführung, Schallsignale
tools/make-icons.py      erzeugt die App-Symbole
tools/smoke.mjs          Rauchtest im echten Browser
tests/geo.test.mjs       Prüfungen der Navigationsrechnung
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
npm test                                  # Navigationsrechnung, 20 Prüfungen
node tools/smoke.mjs                      # Rauchtest im Browser
node tools/smoke.mjs --shots              # zusätzlich Bildschirmfotos
```

Der Rauchtest startet die App in einem echten Chromium mit vorgegebener
GPS-Position, klappert alle Module ab, schaltet die Sprachen um und prüft am
Ende, dass die App ohne Netz weiterläuft. Playwright ist dafür als
Entwicklungsabhängigkeit nötig, für den Betrieb der App nicht.

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
