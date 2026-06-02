# Veyra Pixel Generator

A minimal browser-based pixel branding generator for Festag / Veyra marks. The app loads an image locally, samples it into a clean modular grid, and exports high-resolution PNG or editable SVG artwork.

## Features

- Load PNG, JPG, JPEG, WEBP, or browser-supported SVG images
- Drag and drop image loading
- Paste image from the clipboard with the button or keyboard paste
- Generate a source motif from a text prompt
- Optional Claude-powered motif generation through a Vercel API function
- Local prompt fallback when no Claude API key is configured
- Canvas-based grayscale sampling and pixel mark preview
- Adjustable grid size, element size, small-square ratio, threshold, contrast, padding, and output size
- Square, circle, and rounded-square elements
- One-tone and two-tone generation
- Dark, light, and transparent preview backgrounds
- Configurable background, primary, secondary, and accent colors
- PNG export for clean raster output
- SVG export with editable `rect` and `circle` elements for Figma
- HTML export with the generated SVG embedded in a standalone page
- Copy SVG to clipboard
- Presets, reset, and subtle randomization

## Install

```bash
npm install
```

## Run Locally

```bash
npm run dev
```

Then open the local Vite URL in your browser.

## Build

```bash
npm run build
```

The production build is written to `dist/`.

## Export

1. Type a prompt and generate a motif, or load/drop/paste an image.
2. Adjust the grid and color controls.
3. Use `Export PNG` for a high-resolution raster file.
4. Use `Export SVG` to download `veyra-pixel-mark.svg`.
5. Use `Export HTML` to download `veyra-pixel-mark.html`.
6. Use `Copy SVG` when you want to paste the generated vector markup elsewhere.

Image processing and export rendering run in the browser. Claude motif generation is optional and runs through the Vercel API function so the API key is not exposed to the browser.

## Claude Motif Generation

Set this environment variable in Vercel to enable Claude-backed prompt generation:

```bash
ANTHROPIC_API_KEY=your_api_key
```

Optional:

```bash
ANTHROPIC_MODEL=claude-sonnet-4-20250514
```

If `ANTHROPIC_API_KEY` is not set, the app still works with its local prompt-to-motif fallback.
