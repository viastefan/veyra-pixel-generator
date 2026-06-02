# Veyra Pixel Generator

Minimaler browserbasierter Pixel-Branding-Generator für Festag / Veyra. Die App läuft lokal im Browser, lädt Bilder, erzeugt aus Prompts modulare Motive, erlaubt manuelles Pixelzeichnen, schlägt Logo-Alternativen vor und exportiert PNG, SVG, HTML, Brand-Kit-HTML, Smart-Motion-HTML oder WebM-Video.

## Funktionen

- Bild laden, per Drag and Drop ablegen oder aus der Zwischenablage einfügen
- PNG, JPG, JPEG, WEBP und browserunterstützte SVGs
- Prompt-zu-Motiv mit optionaler Claude-API über Vercel
- Logo Lab mit 16 Alternativen aus Prompt und aktueller Pixel-Skizze
- Optionaler Claude-Endpunkt für kreative Logo-Briefs statt starrer Vorlagen
- Sofort nutzbarer lokaler Motiv-Fallback ohne API-Key
- Deutsche Oberfläche
- Canvas-basierte Bildanalyse mit Raster, Schwelle, Kontrast und Elementgröße
- Stabilere Pixelbestimmung mit `Pixelruhe` gegen störende Einzelpixel
- 1-Ton- und 2-Ton-Modus
- Formen: Quadrat, Kreis und gerundetes Quadrat
- Manuelles Pixelzeichnen direkt auf der Vorschau
- Werkzeuge für helle Pixel, Schattenpixel, Radierer und gerade Pixellinien
- Klarer Zeichnen-an/aus-Schalter direkt über der Canvas
- `Zurück`-Button für die wichtigsten Editor-Schritte
- Favoriten mit lokaler Browser-Speicherung für starke Zwischenstände
- Logo-Vorlagen, 1000-Mix-Randomizer und 16er Logo-Alternativen mit anklickbaren Varianten
- Look-Presets, Reset und subtile Zufallsabstimmung
- Smart-Motion-Live-Vorschau direkt in der App
- PNG-Export für hochauflösende Rasterdateien
- SVG-Export mit editierbaren `rect`- und `circle`-Elementen für Figma
- Statischer HTML-Export mit eingebettetem SVG
- Brand-Kit-HTML mit Logo, Palette, Specs, Usage Checks und editierbarem SVG-Code
- Smart-Motion-HTML: viele Pixel verdichten sich automatisch zu einem reduzierten Mark
- Smart-Motion-WebM-Videoexport ohne externe Bildschirmaufnahme
- SVG in die Zwischenablage kopieren

## Installation

```bash
npm install
```

## Lokal starten

```bash
npm run dev
```

Danach die angezeigte Vite-URL im Browser öffnen.

## Build

```bash
npm run build
```

Der Produktions-Build landet in `dist/`.

## Workflow

1. Prompt eingeben, Bild laden, Bild einfügen oder mit `Leeres Raster` direkt zeichnen.
2. Mit `Pixelmark erzeugen` ein KI-/Fallback-Motiv erstellen oder das Raster manuell bearbeiten.
3. Im Bereich `Smart Motion` die Bewegung direkt ansehen oder mit `Replay` neu abspielen.
4. Im Bereich `Pixel zeichnen` den Zeichenmodus aktivieren und mit ✏️, 🌫️, 🧽 oder 📏 arbeiten.
5. Gute Varianten mit `Merken` als Favorit speichern und später wieder laden.
6. Über `Logo-Vorlagen`, `1000 Mix` oder `16 Logo-Alternativen` neue Markenrichtungen erzeugen.
7. Rastergröße, Elementgröße, Schwelle, Kontrast, Form und Farben fein einstellen.
8. Mit `Pixelruhe` störende Einzelpixel reduzieren oder mehr feine Details zulassen.
9. Mit `PNG`, `SVG`, `HTML`, `Brand Kit`, `Smart-Motion HTML` oder `Video` exportieren.

## Kommerzielle Nutzung

Der App-Code steht unter der MIT-Lizenz und kann kommerziell genutzt, verändert und weitergegeben werden. Die lokal erzeugten Motive verwenden keine externen Bildassets. Wenn Claude über `ANTHROPIC_API_KEY` aktiviert wird, gelten zusätzlich die Nutzungsbedingungen des jeweiligen Modellanbieters für diese generierten Inhalte.

Bildverarbeitung und Exporte laufen im Browser. Die Claude-Motivgenerierung und Claude-Logo-Briefs sind optional und laufen über Vercel-API-Funktionen, damit der API-Key nicht im Browser landet.

## Claude-Motivgenerierung

In Vercel diese Environment Variable setzen, um Claude zu aktivieren:

```bash
ANTHROPIC_API_KEY=your_api_key
```

Optional:

```bash
ANTHROPIC_MODEL=claude-sonnet-4-20250514
```

Ohne `ANTHROPIC_API_KEY` bleibt die App vollständig nutzbar und verwendet lokale Prompt- und Logo-Lab-Fallbacks.
