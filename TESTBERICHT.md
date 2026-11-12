# Funktionsprüfung EDIT//PDF

Stand: 12. November 2026. Getestet wurde das lokale Produktionsbuild in installiertem Google Chrome unter Windows mit Playwright.

**Ergebnis: 79 Tests erfolgreich, 0 fehlgeschlagen, 0 übersprungen, 0 instabile Tests. Der abschließende Gesamtlauf dauerte rund 182 Sekunden und enthält 13 Tests mit Smartphone- und Touch-Emulation. TypeScript-Prüfung und Produktionsbuild erfolgreich.**

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
| PDF-Konvertierung | PNG- und JPG-Ausgaben, DPI, Seitenwahl und Bereichsvalidierung, deutsche Zeichen in TXT, ZIP-Ausgabe mehrerer Seiten, OCR-Hinweis bei fehlender Textebene, Abbrechen |
| Foto-PDFs | JPG/JPEG, PNG, WebP und AVIF; Reihenfolge, Drehung, JPEG-EXIF-Ausrichtung, A4, Hochformat, Bildformat, 0-/20-mm-Ränder, Farbkontrolle der tatsächlich gerenderten PDF-Vorschau, mehrseitiger Download |
| Bereichswechsel | Foto-PDF im Editor öffnen; bearbeitete Editor-PDF inklusive Live-Entwurf im Konverter übernehmen; Fotoauswahl und Editorzustand beim Wechsel erhalten |
| Grenzen und Konverteransicht | Ungültige und defekte Fotos, 20-MB-Fotogrenze, höchstens 50 Fotos, höchstens 100 exportierte Seiten, größere Eingabeschrift und responsive Ansichten bei 360/768/1440 Pixel |
| PDFs kombinieren | Mehrfachauswahl, Drag-and-drop, Reihenfolge ändern, Entfernen, Live-Vorschau mit Seitennavigation, Download mit deutschem Dateinamen; Erhalt von Text, Seitenformat, Drehung und CropBox; Ergebnis im Editor öffnen; bearbeitete Editor-PDF samt unbestätigtem Entwurf hinzufügen |
| Kombinationszustand | Auswahl beim Bereichswechsel erhalten, altes Ergebnis nach Listenänderung verwerfen, ungültigen Mehrfachupload vollständig zurückweisen, Datei- und Seitengrenzen, Abbrechen beim Prüfen und erneutes Hinzufügen |
| Viewport | Startseite, geladener Editor, Konverter und Kombinationsansicht bei 360×640, 390×844, 768×1024, 1280×720, 1440×900 und 844×390 Pixeln ohne äußeren horizontalen oder vertikalen Scrollbereich; erreichbare Uploads und Downloads; lange Dateiliste scrollt intern; Tabnavigation per Pfeiltasten |
| Smartphone-Navigation | Touch-Emulation bei 320×568, 360×640, 390×844, 430×932 und 844×390 Pixeln; mindestens 44 Pixel hohe Hauptnavigation; getrennte Ansichten für Dokument, Eigenschaften und Seiten; beschriftete Werkzeugleiste mit Wischgeste und feste Undo-/Redo-Schaltflächen |
| Smartphone-Bearbeitung | Vorhandenen Text antippen, ändern und herunterladen; Seiten auswählen, umsortieren, löschen und wiederherstellen; PDF mit dem Finger scrollen, neuen Text per Finger verschieben und Freihand zeichnen; automatische Breitenanpassung beim Drehen; erreichbarer Zoom und Einpassen |
| Smartphone-Konvertierung | Foto auswählen und drehen, PDF-Einstellungen aufrufen, PDF erstellen und herunterladen sowie Vorschau öffnen; PDF nach TXT mit Umlauten exportieren; PDFs sortieren, kombinieren und herunterladen; interne Bereiche beim Wechsel erhalten |
| Kleiner Sichtbereich | Texteingabe und Bestätigung bei auf 390×360 Pixel verkleinertem Sichtbereich; Rückkehr zur Vorschau und Download; Safe-Area-Abstände und Viewport-Metadaten für Bildschirmtastaturen |

Heruntergeladene Dateien wurden mit PDF.js beziehungsweise pdf-lib unabhängig von der Editoroberfläche auf Textinhalt, Seitenzahl, Seitenreihenfolge und PDF-Geometrie geprüft. Bei den erweiterten Funktionstests werden unbehandelte Browserfehler ebenfalls als Testfehler gewertet.

Die Konvertierungsprüfungen lesen zusätzlich PNG-Abmessungen und Dateisignaturen, entpacken ZIP-Ausgaben mit fflate und kontrollieren JPG-Signaturen. Bei Foto-PDFs werden Seitenformate und Bildreihenfolge anhand der tatsächlichen PDF-Vorschau geprüft. Die neue Konvertierung enthält keine Word-/Excel-Ausgabe und keine automatische OCR; die unterstützten Zielformate sind PNG, JPG, TXT und PDF aus Fotos.

## Gefundene und behobene Fehler

1. **Absturz beim Wiederholen einer Seitenlöschung:** Nach dem Zurückholen und Anwählen der letzten Seite konnte Redo auf einen ungültigen Seitenindex zeigen. Der aktive Index wird jetzt auch beim Wiederholen begrenzt.
2. **Linker Seitenrand bei hohem Zoom nicht erreichbar:** Die Zentrierung konnte überbreite Seiten nach links außerhalb des erreichbaren Scrollbereichs verschieben. Die Seite bleibt nun bei Überbreite links erreichbar und wird bei ausreichendem Platz zentriert.
3. **Falscher Aktualitätsstatus der Vorschau:** Nach einem Schriftladefehler wurde die alte Vorschau als aktuell bezeichnet. Der Status berücksichtigt jetzt, ob die zuletzt erfolgreich gerenderte Version zum aktuellen Entwurf gehört.
4. **Text mit dem Finger verschieben:** Der Browser konnte das Ziehen als Scrollgeste abbrechen; außerdem durfte die Eigenschaftenansicht nicht während des Ziehens öffnen. Texte und andere Ergänzungen reservieren jetzt die Touchgeste auf ihren tatsächlichen SVG-Elementen. Die Eigenschaften öffnen nach Abschluss des Ziehens; freie PDF-Flächen bleiben scrollbar.

Diese Fälle besitzen jeweils einen Regressionstest.

## Umfang und Wiederholung

Die Smartphone-Prüfungen verwenden Chromes Touch- und Mobilgeräte-Emulation sowie Touch-Ereignisse für Wisch-, Zeichen- und Ziehgesten. Die Bildschirmtastatur wird durch einen verkleinerten Sichtbereich angenähert. Reale Mobilgeräte, Firefox und Safari gehören nicht zu dieser Prüfung. Für gescannte PDFs ohne Textebene bleibt vorherige OCR erforderlich.

```sh
npm run build
npx vite preview --host 127.0.0.1 --port 5175 --strictPort
# In einem zweiten Terminal:
npm test
```

Testquellen: `tests/editor.spec.ts`, `tests/functions.spec.ts`, `tests/conversion.spec.ts`, `tests/merge.spec.ts`, `tests/viewport.spec.ts` und `tests/mobile.spec.ts`. Maschinenlesbares Ergebnis: `test-results/results.json` (lokal erzeugt und nicht im Repository gespeichert).
