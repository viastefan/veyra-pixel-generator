# Veyra Pixel Generator

A minimal browser-based pixel branding generator for Festag / Veyra marks. The app loads an image locally, samples it into a clean modular grid, and exports high-resolution PNG or editable SVG artwork.

## Features

- Load PNG, JPG, JPEG, WEBP, or browser-supported SVG images
- Drag and drop image loading
- Paste image from the clipboard with the button or keyboard paste
- Canvas-based grayscale sampling and pixel mark preview
- Adjustable grid size, element size, small-square ratio, threshold, contrast, padding, and output size
- Square, circle, and rounded-square elements
- One-tone and two-tone generation
- Dark, light, and transparent preview backgrounds
- Configurable background, primary, secondary, and accent colors
- PNG export for clean raster output
- SVG export with editable `rect` and `circle` elements for Figma
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

1. Load, drop, or paste an image.
2. Adjust the grid and color controls.
3. Use `Export PNG` for a high-resolution raster file.
4. Use `Export SVG` to download `veyra-pixel-mark.svg`.
5. Use `Copy SVG` when you want to paste the generated vector markup elsewhere.

All image processing runs in the browser. The app has no backend, login, or external API calls.
