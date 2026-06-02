import type { GeneratedGrid, GeneratorSettings } from '../types'
import { generateSvg } from './svgExport'

type BrandKitMeta = {
  prompt: string
  sourceLabel: string
  imageName: string
  generatedAt: string
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const formatPercent = (value: number) => `${Math.round(value)}%`

function colorSwatch(label: string, value: string) {
  return `<div class="swatch">
          <span class="chip" style="background:${escapeHtml(value)}"></span>
          <span>${escapeHtml(label)}</span>
          <code>${escapeHtml(value)}</code>
        </div>`
}

function specRow(label: string, value: string | number) {
  return `<div class="spec-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`
}

function downloadTextFile(content: string, fileName: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

export function generateBrandKitHtml(grid: GeneratedGrid, settings: GeneratorSettings, meta: BrandKitMeta) {
  const svg = generateSvg(grid, settings)
  const transparentSvg = generateSvg(grid, { ...settings, transparentBg: true })
  const density = (grid.elements.length / (grid.gridSize * grid.gridSize)) * 100
  const transparentLabel = settings.transparentBg ? 'Transparent' : settings.bgColor

  return `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Veyra Pixel Brand Kit</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #070B12;
        --panel: #0B1118;
        --surface: #101821;
        --border: rgba(255,255,255,.1);
        --text: #E8EDF4;
        --muted: #9AA4B2;
        --accent: ${escapeHtml(settings.accentColor)};
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        background: var(--bg);
        color: var(--text);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        width: min(1120px, calc(100vw - 40px));
        margin: 0 auto;
        padding: 44px 0;
        display: grid;
        gap: 24px;
      }
      header {
        display: flex;
        align-items: end;
        justify-content: space-between;
        gap: 20px;
        border-bottom: 1px solid var(--border);
        padding-bottom: 24px;
      }
      h1, h2, p { margin: 0; }
      h1 { font-size: clamp(30px, 5vw, 64px); line-height: .94; letter-spacing: 0; }
      h2 { color: var(--muted); font-size: 12px; letter-spacing: .14em; text-transform: uppercase; }
      p { color: var(--muted); line-height: 1.65; }
      .date { color: var(--muted); font-size: 13px; }
      .grid {
        display: grid;
        grid-template-columns: minmax(0, 1.1fr) minmax(320px, .9fr);
        gap: 24px;
      }
      .panel {
        border: 1px solid var(--border);
        border-radius: 18px;
        background: rgba(11,17,24,.76);
        overflow: hidden;
      }
      .mark-stage {
        min-height: 620px;
        display: grid;
        place-items: center;
        padding: 52px;
        background: ${settings.transparentBg ? '#070B12' : escapeHtml(settings.bgColor)};
      }
      .mark-stage svg { width: min(72vmin, 560px); height: auto; display: block; }
      .side {
        display: grid;
        gap: 16px;
      }
      .section {
        display: grid;
        gap: 14px;
        padding: 18px;
      }
      .swatches { display: grid; gap: 10px; }
      .swatch {
        display: grid;
        grid-template-columns: 34px minmax(0, 1fr) auto;
        align-items: center;
        gap: 10px;
        color: var(--muted);
        font-size: 13px;
      }
      .chip {
        width: 34px;
        height: 34px;
        border: 1px solid var(--border);
        border-radius: 10px;
      }
      code, textarea {
        color: var(--text);
        background: rgba(3,5,8,.52);
        border: 1px solid var(--border);
        border-radius: 10px;
      }
      code { padding: 4px 7px; font-size: 12px; }
      .specs { display: grid; gap: 8px; }
      .spec-row {
        display: flex;
        justify-content: space-between;
        gap: 18px;
        color: var(--muted);
        font-size: 13px;
      }
      .spec-row strong { color: var(--text); font-weight: 600; text-align: right; }
      textarea {
        width: 100%;
        min-height: 210px;
        resize: vertical;
        padding: 12px;
        font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      }
      .usage {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
      }
      .usage-card {
        min-height: 126px;
        display: grid;
        place-items: center;
        padding: 20px;
        border: 1px solid var(--border);
        border-radius: 14px;
      }
      .usage-card svg { width: 82%; height: auto; max-height: 96px; }
      .usage-light { background: #F2F5F8; }
      .usage-dark { background: #070B12; }
      .usage-muted { background: #6a738c; }
      @media (max-width: 820px) {
        main { width: min(100vw - 24px, 1120px); padding: 24px 0; }
        header, .grid { grid-template-columns: 1fr; display: grid; }
        .mark-stage { min-height: 420px; padding: 28px; }
        .usage { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div>
          <h1>Veyra Pixel Brand Kit</h1>
          <p>${escapeHtml(meta.sourceLabel || 'Pixel Mark')} · ${grid.elements.length} Pixel · ${grid.gridSize}er Raster</p>
        </div>
        <span class="date">${escapeHtml(meta.generatedAt)}</span>
      </header>

      <section class="grid">
        <article class="panel mark-stage" aria-label="Primary Mark">
${svg
  .split('\n')
  .map((line) => `          ${line}`)
  .join('\n')}
        </article>

        <aside class="side">
          <section class="panel section">
            <h2>Palette</h2>
            <div class="swatches">
              ${colorSwatch('Background', settings.bgColor)}
              ${colorSwatch('Primary', settings.primaryColor)}
              ${colorSwatch('Secondary', settings.secondaryColor)}
              ${colorSwatch('Accent', settings.accentColor)}
            </div>
          </section>

          <section class="panel section">
            <h2>Specs</h2>
            <div class="specs">
              ${specRow('Exportgröße', `${settings.outputSize}px`)}
              ${specRow('Raster', grid.gridSize)}
              ${specRow('Pixel', grid.elements.length)}
              ${specRow('Dichte', density.toFixed(1) + '%')}
              ${specRow('Form', settings.shape)}
              ${specRow('Tonmodus', settings.tones === 'two' ? '2 Töne' : '1 Ton')}
              ${specRow('Hintergrund', transparentLabel)}
              ${specRow('Schwelle', formatPercent(settings.threshold))}
              ${specRow('Kontrast', formatPercent(settings.contrast))}
            </div>
          </section>

          <section class="panel section">
            <h2>Kontext</h2>
            <p>${escapeHtml(meta.prompt || 'Kein Prompt gesetzt.')}</p>
            <p>${escapeHtml(meta.imageName || 'Kein Quellenname gesetzt.')}</p>
          </section>
        </aside>
      </section>

      <section class="panel section">
        <h2>Usage Checks</h2>
        <div class="usage">
          <div class="usage-card usage-dark">${transparentSvg}</div>
          <div class="usage-card usage-light">${transparentSvg}</div>
          <div class="usage-card usage-muted">${transparentSvg}</div>
        </div>
      </section>

      <section class="panel section">
        <h2>Editable SVG</h2>
        <textarea readonly>${escapeHtml(svg)}</textarea>
      </section>
    </main>
  </body>
</html>`
}

export function downloadBrandKitHtml(
  grid: GeneratedGrid,
  settings: GeneratorSettings,
  meta: BrandKitMeta,
  fileName = 'veyra-brand-kit.html',
) {
  downloadTextFile(generateBrandKitHtml(grid, settings, meta), fileName, 'text/html;charset=utf-8')
}
