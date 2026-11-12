# EDIT//PDF

Ein flacher PDF-Editor in Neongrün auf Schwarz. React, TypeScript und Vite.

## Starten

```sh
npm install
npm run dev
```

```sh
npm run build
npm run preview
```

PDFs bis 50 MB öffnen oder per Drag-and-drop ablegen. Mit **Text bearbeiten** vorhandene Textblöcke anklicken, den Inhalt rechts ändern und **Übernehmen** drücken. Schriftgröße und Farbe sind einstellbar. Textblöcke lassen sich auch löschen; Änderungen unterstützen Rückgängig/Wiederholen. Neue Texte, Markierungen, Zeichnungen, Rechtecke sowie Bilder ergänzen. Seiten umsortieren oder löschen. Die bearbeitete PDF herunterladen.

Die **Live-Vorschau** zeigt vorhandenen Text etwa 300 ms nach der letzten Eingabe neu gerendert an. Das Textfeld bleibt bedienbar. **Übernehmen** bestätigt den Entwurf, **Abbrechen** stellt den bestätigten Stand wieder her. **Herunterladen** berücksichtigt den aktuell sichtbaren Entwurf auch ohne vorheriges Übernehmen. Neuer Text erscheint direkt beim Tippen auf der Seite.

Deutsche Zeichen **ä ö ü Ä Ö Ü ß ẞ** werden über die lokale Schrift Noto Sans und Unicode-Normalisierung unterstützt, auch wenn eine hochgeladene PDF nur einen Teil der ursprünglichen Schrift enthält. Neu ergänzter deutscher Text wird ebenfalls als suchbarer PDF-Text exportiert.

Die Dokumente bleiben im Browser und werden weder hochgeladen noch dauerhaft gespeichert. PDFium ersetzt vorhandene Textobjekte im Seiteninhalt. Der ursprüngliche Text wird entfernt, der Ersatz bleibt als PDF-Text suchbar. Die Originalschrift wird verwendet, sofern sie die neuen Zeichen enthält; sonst wird Noto Sans eingebettet. Textblöcke behalten ihre Position, andere Absätze fließen nicht automatisch um. Gescannten Seiten fehlt eine Textebene; sie benötigen zuvor OCR. Passwortgeschützte PDFs müssen vorab entsperrt werden. Markierungen, Zeichnungen, Formen und Bilder werden als transparente Bildauflagen eingebettet. Für Symbole außerhalb der eingebetteten Schrift verwendet neuer Text ebenfalls eine Bildauflage mit Browser-Schriftersatz.

## Tests

```sh
npm test
```

Playwright erwartet eine laufende Anwendung unter `http://127.0.0.1:5175`. Mit `TEST_URL` lässt sich eine andere Adresse setzen. Unter Windows wird das installierte Chrome verwendet; auf anderen Systemen muss Playwright Chromium verfügbar sein.

Die Tests prüfen Dateiimport, Text, Markierungen, Zeichnungen, Rückgängig/Wiederholen, PDF-Download, Seitenverwaltung und mobile Darstellung. Beim Ersetzen bestehenden Textes wird unabhängig mit PDF.js geprüft, dass der alte Text fehlt und der neue extrahierbar ist. Das gilt auch für gedrehte Seiten mit CropBox und Text in eingebetteten PDF-Seiten.

Weitere Tests prüfen die tatsächlich gerenderte Live-PDF beim Tippen, das Verwerfen von Entwürfen, Downloads ohne vorheriges Übernehmen sowie deutsche Zeichen in bestehenden Teilschriften und neu eingefügten Texten.
