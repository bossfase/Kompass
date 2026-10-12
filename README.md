# Mein Kompass

Persönlicher Alltags-Co-Pilot als Web-App (PWA) fürs iPhone und iPad: Fokus-Timer mit wachsenden Blumen, automatische Wochenplanung, „Was soll ich jetzt machen?“, Abend-Check-in und Rückblicke.

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html` | Oberfläche, Styling, Speicherung (localStorage) |
| `logic.js` | Reine Logik ohne Oberfläche: Wochenplaner, Empfehlungen, Wochen- und Monatsbericht, .ics-Import |
| `manifest.webmanifest`, `*.png` | App-Icon und Home-Bildschirm-Einstellungen |
| `sw.js` | Offline-Cache: Die App startet nach dem ersten Besuch auch ohne Internet |
| `tests/logic.test.js` | 27 Tests für die Logik |
| `tests/e2e.py` | 45 Browser-Prüfungen (Playwright) |
| `tests/shots.py` | Screenshots aller Ansichten mit Beispieldaten |

## Hochladen (Cloudflare)

Alle Dateien ins Repo legen. Cloudflare veröffentlicht sie automatisch. Auf dem iPhone öffnest du die Seite in Safari und wählst Teilen → „Zum Home-Bildschirm“.

## Testen

```bash
node tests/logic.test.js                     # Logik
python3 -m http.server 8765 &                # lokaler Server
python3 tests/e2e.py ./screenshots           # Browser-Test (braucht: pip install playwright && playwright install chromium)
```

## Daten

Alles liegt im localStorage unter `kompass-state-v1` (Schema 2). Ältere Daten werden beim ersten Start automatisch migriert, ohne dass etwas gelöscht wird. Backup und Wiederherstellen gehen über die Startseite.

## Wie der Planer entscheidet

1. Feste Termine (inkl. Wegezeit), Termine und importierte Kalendereinträge blockieren Zeit.
2. Die Tageskapazität ergibt sich aus deinem Profil. Sie sinkt an vollen Tagen, nach einem „ruhig starten“-Wunsch im Check-in und bei zuletzt wenig Energie. Etwa 20 % der freien Zeit bleiben als Puffer frei.
3. Prüfungen in den nächsten 4 Wochen erzeugen Lernblöcke. Routinen erzeugen ihre Termine für die Woche, ohne Duplikate.
4. Aufgaben über 60 Minuten werden in Teile zerlegt.
5. Verteilt wird nach Frist, Priorität und Auslastung. Gleiche Fächer landen auf verschiedenen Tagen, große Aufgaben sind pro Tag begrenzt.
6. Erledigte und von dir festgelegte Aufgaben bleiben, wo sie sind. Was nicht realistisch passt, wird gemeldet, nicht hineingequetscht.

## Anleitung

Beim ersten Start öffnet sich eine Anleitung mit zehn Kapiteln. Danach erreichst du sie über das kleine ? oben rechts oder über „Anleitung“ ganz unten auf der Startseite. Die Texte stehen in `GUIDE` in `index.html`.

## „Was soll ich jetzt machen?“

Zuerst kommen passende Aufgaben aus deinem Plan. Gibt es keine oder passt keine, schlägt die App konkrete Ideen aus einer festen Bibliothek vor (`IDEAS` in `logic.js`): Ruhe, Self-Care, Bewegung, Aufräumen, Kreatives, Lernen. Ausgewählt wird nach Energie, Zeit, Wunsch und ob Liana gerade dabei ist. Zuletzt gezeigte Ideen werden gemieden. Handy und Social Media werden nie vorgeschlagen.

## Design

Editorial statt Dashboard: Jede Ansicht ist wie eine Magazinseite aufgebaut, mit einem Kopf in großer Display-Schrift und Inhalten auf Haarlinien statt in Karten.

- **Schriften:** Syne für große Titel und Zahlen, Instrument Sans für Text, DM Mono für Zeiten und Labels. Offline nutzt iOS „Avenir Next“ als Ersatz.
- **Farben:** Creme `#F5EEE4`, Tinte `#1B1415`, Pink `#E3346E`, Weinrot `#4E1426`. Pink setzt Akzente, Weinrot markiert Zustände wie „Fokus läuft“ oder „Abend-Check-in“. Kein Gelb.
- **Formen:** eckig. Die einzige runde Form sind kleine Statuspunkte.
- **Blumen:** botanische Zeichnungen mit feiner Tusche-Linie und flacher Farbe, gesammelt als Tafeln im Herbarium.
