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

PDFs bis 50 MB öffnen oder per Drag-and-drop ablegen. Neue Texte, transparente Markierungen, Freihandzeichnungen, Rechtecke sowie PNG-, JPG- und WebP-Bilder ergänzen. Eigene Elemente auswählen, verschieben und entfernen. Seiten umsortieren oder löschen. Änderungen rückgängig machen oder wiederholen. Die bearbeitete PDF herunterladen.

Die Dokumente bleiben im Browser und werden weder hochgeladen noch dauerhaft gespeichert. Vorhandene PDF-Texte lassen sich nicht direkt umschreiben. Ergänzungen werden beim Export als transparente Bildauflage eingebettet; der ursprüngliche Seiteninhalt bleibt erhalten. Passwortgeschützte PDFs müssen vorab entsperrt werden.

## Tests

```sh
npm test
```

Playwright erwartet eine laufende Anwendung unter `http://127.0.0.1:5175`. Mit `TEST_URL` lässt sich eine andere Adresse setzen. Unter Windows wird das installierte Chrome verwendet; auf anderen Systemen muss Playwright Chromium verfügbar sein.

Die Tests prüfen Dateiimport, Text, Markierungen, Zeichnungen, Rückgängig/Wiederholen, PDF-Download, Seitenverwaltung, mobile Darstellung und die Exportposition auf gedrehten PDF-Seiten mit CropBox.
