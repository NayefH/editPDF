# Funktionsprüfung EDIT//PDF

Stand: 12. November 2026. Getestet wurde das lokale Produktionsbuild in installiertem Google Chrome unter Windows mit Playwright.

**Ergebnis: 36 Tests erfolgreich, 0 fehlgeschlagen, 0 übersprungen, 0 instabile Tests. Laufzeit der abschließenden Suite: rund 91 Sekunden. TypeScript-Prüfung und Produktionsbuild erfolgreich.**

| Bereich | Geprüfte Abläufe |
| --- | --- |
| PDF-Import | Dateiauswahl, Abbrechen, Drag-and-drop, Großschreibung der Dateiendung, ungültige Datei, falsche Endung, Grenze von 50 MB, Passwortschutz |
| Vorhandener Text | Auswählen per Maus und Tastatur, Ersetzen, Löschen, Schriftgröße und Farbe, mehrzeiliger Text, Text in eingebetteten PDF-Seiten |
| Deutsche Zeichen | ä, ö, ü, Ä, Ö, Ü, ß und ẞ; eingebettete Teilschriften; zusammengesetzte Unicode-Zeichen; suchbarer Export |
| Live-Vorschau | Aktualisierung beim Tippen, schnelle Eingabefolgen, Bestätigen, Abbrechen, Wiederherstellen, Download eines unbestätigten Entwurfs |
| Neuer Text | Direktes Anzeigen ohne Fokuswechsel, Formatieren, eigene Farbe, Verschieben, Entfernen, Wiederherstellen und suchbarer PDF-Export |
| Zeichnen und Markieren | Textmarker, Freihandzeichnung, Strichstärke, Rechtecke auch beim rückwärts Aufziehen, Rückgängig/Wiederholen |
| Bilder | PNG, JPG und WebP; Einfügen, proportionale Größenänderung, Verschieben, Löschen, Wiederherstellen, Export; falsches Format, defekte Daten und Grenze von 10 MB |
| Seiten | Navigation, Umsortieren in beide Richtungen, Löschen, Schutz der letzten Seite, Undo/Redo; tatsächliche Reihenfolge im heruntergeladenen PDF |
| Zoom und PDF-Geometrie | 25 bis 200 Prozent, Einpassen, erreichbarer linker Rand, Seiten mit CropBox und Drehungen von 0, 90, 180 und 270 Grad |
| Fehler und Dokumentwechsel | Abbruchschutz bei ungesicherten Änderungen, Wechsel bestätigen oder abbrechen, Erhalt der bisherigen Datei bei ungültigem Upload, Fehler beim Laden der Ersatzschrift und erfolgreiche Wiederherstellung |
| Scans | OCR-Hinweis bei fehlender Textebene; Ergänzen neuer Texte weiterhin möglich |
| Hilfe und Anime.js | Dialog öffnen, Schließen über Schaltfläche, Symbol und Hintergrund; tatsächlich laufende Anime.js-Animation; reduzierte Bewegung einschließlich Umschalten während einer Animation |
| Lesbarkeit | Größere Schrift in Schaltflächen und Eingabefeldern; responsive Ansichten bei 360, 768 und 1440 Pixel Breite ohne horizontalen Überlauf |

Heruntergeladene Dateien wurden mit PDF.js beziehungsweise pdf-lib unabhängig von der Editoroberfläche auf Textinhalt, Seitenzahl, Seitenreihenfolge und PDF-Geometrie geprüft. Bei den erweiterten Funktionstests werden unbehandelte Browserfehler ebenfalls als Testfehler gewertet.

## Gefundene und behobene Fehler

1. **Absturz beim Wiederholen einer Seitenlöschung:** Nach dem Zurückholen und Anwählen der letzten Seite konnte Redo auf einen ungültigen Seitenindex zeigen. Der aktive Index wird jetzt auch beim Wiederholen begrenzt.
2. **Linker Seitenrand bei hohem Zoom nicht erreichbar:** Die Zentrierung konnte überbreite Seiten nach links außerhalb des erreichbaren Scrollbereichs verschieben. Die Seite bleibt nun bei Überbreite links erreichbar und wird bei ausreichendem Platz zentriert.
3. **Falscher Aktualitätsstatus der Vorschau:** Nach einem Schriftladefehler wurde die alte Vorschau als aktuell bezeichnet. Der Status berücksichtigt jetzt, ob die zuletzt erfolgreich gerenderte Version zum aktuellen Entwurf gehört.

Alle drei Fälle besitzen einen Regressionstest und sind in der erfolgreichen Abschlusssuite enthalten.

## Umfang und Wiederholung

Die schmalen Ansichten wurden im Desktopbrowser emuliert; reale Mobilgeräte, Firefox und Safari gehören nicht zu dieser Prüfung. Für gescannte PDFs ohne Textebene bleibt vorherige OCR erforderlich.

```sh
npm run build
npx vite preview --host 127.0.0.1 --port 5175 --strictPort
# In einem zweiten Terminal:
npm test
```

Testquellen: `tests/editor.spec.ts` und `tests/functions.spec.ts`. Maschinenlesbares Ergebnis der Prüfung: `test-results/results.json` (lokal erzeugt und nicht im Repository gespeichert).
