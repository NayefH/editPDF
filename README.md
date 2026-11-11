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

Die Dokumente bleiben im Browser und werden weder hochgeladen noch dauerhaft gespeichert. PDFium ersetzt vorhandene Textobjekte im Seiteninhalt. Der ursprüngliche Text wird entfernt, der Ersatz bleibt als PDF-Text suchbar. Die Originalschrift wird verwendet, sofern sie die neuen Zeichen enthält; sonst wird Noto Sans eingebettet. Textblöcke behalten ihre Position, andere Absätze fließen nicht automatisch um. Gescannten Seiten fehlt eine Textebene; sie benötigen zuvor OCR. Passwortgeschützte PDFs müssen vorab entsperrt werden. Ergänzungen werden weiterhin als transparente Bildauflage eingebettet.

## Tests

```sh
npm test
```

Playwright erwartet eine laufende Anwendung unter `http://127.0.0.1:5175`. Mit `TEST_URL` lässt sich eine andere Adresse setzen. Unter Windows wird das installierte Chrome verwendet; auf anderen Systemen muss Playwright Chromium verfügbar sein.

Die Tests prüfen Dateiimport, Text, Markierungen, Zeichnungen, Rückgängig/Wiederholen, PDF-Download, Seitenverwaltung und mobile Darstellung. Beim Ersetzen bestehenden Textes wird unabhängig mit PDF.js geprüft, dass der alte Text fehlt und der neue extrahierbar ist. Das gilt auch für gedrehte Seiten mit CropBox und Text in eingebetteten PDF-Seiten.
