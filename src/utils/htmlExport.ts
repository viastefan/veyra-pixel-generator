import type { GeneratedGrid, GeneratorSettings } from '../types'
import { generateSvg } from './svgExport'

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function generateStandaloneHtml(grid: GeneratedGrid, settings: GeneratorSettings) {
  const svg = generateSvg(grid, settings)
  const background = settings.transparentBg ? '#070B12' : settings.bgColor

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Veyra Pixel Mark</title>
    <style>
      :root { color-scheme: dark; background: ${escapeHtml(background)}; }
      * { box-sizing: border-box; }
      body {
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        background: ${escapeHtml(background)};
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        width: min(76vmin, 900px);
        aspect-ratio: 1;
        display: grid;
        place-items: center;
      }
      svg {
        display: block;
        width: 100%;
        height: auto;
      }
    </style>
  </head>
  <body>
    <main aria-label="Veyra Pixel Mark">
${svg
  .split('\n')
  .map((line) => `      ${line}`)
  .join('\n')}
    </main>
  </body>
</html>`
}

export function downloadHtml(grid: GeneratedGrid, settings: GeneratorSettings, fileName = 'veyra-pixel-mark.html') {
  const html = generateStandaloneHtml(grid, settings)
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}
