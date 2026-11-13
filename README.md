# EDIT//PDF

Ein flacher PDF-Editor in Neongrün auf Schwarz. React, TypeScript und Vite.

## Konvertieren

Der Bereich **Konvertieren** ergänzt den Editor um zwei Abläufe. Beim Wechseln zwischen den Bereichen bleiben das geöffnete Dokument, der Live-Entwurf und die Fotoauswahl erhalten.

- **PDF → PNG, JPG oder TXT:** PDF auswählen oder die geöffnete, bearbeitete PDF aus dem Editor übernehmen. Seitenbereiche wie `1-3, 5` sind möglich. Bilder lassen sich mit 72, 150 oder 300 dpi ausgeben; mehrere Seiten werden als ZIP heruntergeladen. TXT übernimmt die vorhandene Textebene einschließlich deutscher Zeichen und ersetzt keine OCR.
- **Fotos → PDF:** JPG/JPEG, PNG, WebP und AVIF auswählen oder ablegen, Reihenfolge ändern und Fotos drehen. A4 mit automatischer, Hoch- oder Querformat-Ausrichtung sowie ein zum Bild passendes Seitenformat sind verfügbar. Ränder: 0, 10 oder 20 mm. Die Vorschau zeigt die erzeugte PDF; sie kann heruntergeladen oder direkt im Editor geöffnet werden. JPEG-EXIF-Ausrichtung wird berücksichtigt.

Grenzen für die Konvertierung: PDF-Dateien bis 50 MB und bis zu 100 ausgewählte Seiten pro Export; höchstens 50 Fotos mit je 20 MB und zusammen 100 MB. Große Fotos werden für die Verarbeitung auf höchstens 16 Megapixel beziehungsweise 6000 Pixel Kantenlänge verkleinert. Die Verarbeitung bleibt lokal im Browser und lässt sich abbrechen. Die neue Oberfläche verwendet etwa 16 px für Bedienelemente und 18 px für Eingaben.

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

## GitHub Pages

Unter **Settings → Pages → Build and deployment → Source** muss **GitHub Actions** ausgewählt sein. Nach einem Push auf `main` installiert `.github/workflows/static.yml` die Abhängigkeiten mit Node.js 24, baut die Anwendung und veröffentlicht ausschließlich `dist/`. Der Workflow lässt sich auch manuell über den Actions-Tab starten.

Der Basispfad wird aus der Pages-Konfiguration übernommen, für dieses Repository üblicherweise `/editPDF/`. PDF.js-Dateien, WebAssembly, Worker und lokale Schriften werden unter diesem Pfad geladen. Ohne `VITE_BASE_PATH` bleibt der lokale Basispfad `/`. Das entspricht der [Vite-Anleitung für GitHub Pages](https://vite.dev/guide/static-deploy.html#github-pages).

Den Pages-Build einschließlich PDF-Bearbeitung und Export lokal unter PowerShell prüfen:

```powershell
$env:VITE_BASE_PATH = '/editPDF/'
npm run build
$env:CI = 'true'
$env:TEST_URL = 'http://127.0.0.1:5175/editPDF/'
npm test -- tests/pages.spec.ts
Remove-Item Env:VITE_BASE_PATH, Env:CI, Env:TEST_URL
```

In CI startet Playwright den Vorschau-Server automatisch. Der Pages-Workflow prüft den Produktionsbuild vor dem Upload und anschließend die tatsächlich veröffentlichte URL einschließlich PDF-Bearbeitung und Download. Für den Live-Test verhindert `PLAYWRIGHT_SKIP_WEBSERVER=true` den Start eines lokalen Servers; zwei Wiederholungen erlauben die verzögerte Bereitstellung durch Pages. Die Node.js-CI führt die gesamte Testsuite auf dem Standardpfad aus. Bei Fehlern speichern beide Workflows Screenshots und Playwright-Traces als Actions-Artefakte.

## Tests

```sh
npm test
```

Playwright erwartet eine laufende Anwendung unter `http://127.0.0.1:5175`. Mit `TEST_URL` lässt sich eine andere Adresse setzen. Unter Windows wird das installierte Chrome verwendet; auf anderen Systemen muss Playwright Chromium verfügbar sein.

Die Tests prüfen Dateiimport, Text, Markierungen, Zeichnungen, Rückgängig/Wiederholen, PDF-Download, Seitenverwaltung und mobile Darstellung. Beim Ersetzen bestehenden Textes wird unabhängig mit PDF.js geprüft, dass der alte Text fehlt und der neue extrahierbar ist. Das gilt auch für gedrehte Seiten mit CropBox und Text in eingebetteten PDF-Seiten.

Weitere Tests prüfen die tatsächlich gerenderte Live-PDF beim Tippen, das Verwerfen von Entwürfen, Downloads ohne vorheriges Übernehmen sowie deutsche Zeichen in bestehenden Teilschriften und neu eingefügten Texten.

Anime.js 4 animiert das Öffnen der Oberfläche, Werkzeug-Icons, Dokument- und Dialogwechsel sowie die Live-Anzeige. Die Animationen verändern keine PDF-Koordinaten und werden bei `prefers-reduced-motion: reduce` deaktiviert, auch wenn die Einstellung während der Nutzung wechselt. Die Bedienelemente verwenden größere Schrift; responsive Tests decken 360, 768 und 1440 Pixel Breite ab.

Die vollständige Funktionssuite prüft zusätzlich Größenlimits, Passwortschutz, Drag-and-drop, PNG/JPG/WebP, Skalieren und Verschieben, Farben und Schriftgrößen, Seitenreihenfolge im tatsächlichen Download, Zoom-Grenzen, Scan-Hinweise, Fehlerbehebung sowie Anime.js und reduzierte Bewegung. Sie kann gegen das Produktionsbuild ausgeführt werden:

`tests/conversion.spec.ts` ergänzt Prüfungen für tatsächliche PNG-/JPG-/TXT-/ZIP-Ausgaben, Foto-PDFs, EXIF-Ausrichtung, AVIF, Seitenformate, Ränder, Reihenfolge, Vorschau, Abbrechen sowie die Übernahme bearbeiteter Dokumente und responsive Ansichten.

```sh
npm run build
npx vite preview --host 127.0.0.1 --port 5175 --strictPort
# In einem zweiten Terminal:
npm test
```
