import type { GeneratedGrid, GeneratorSettings, GridElement } from '../types'
import { getSmartMotionPlan } from './htmlExport'

type MotionFrame = 'start' | 'middle' | 'end'

type MotionSequenceMeta = {
  prompt: string
  sourceLabel: string
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const escapeAttribute = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const toNumber = (value: number) => Number(value.toFixed(3)).toString()

function downloadTextFile(content: string, fileName: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

function elementShapeToSvg(
  element: GridElement,
  settings: GeneratorSettings,
  frame: MotionFrame,
  keep: boolean,
  offsetX: number,
  offsetY: number,
) {
  if (frame === 'end' && !keep) {
    return ''
  }

  const progress = frame === 'start' ? 0 : frame === 'middle' ? 0.56 : 1
  const opacity = keep ? 1 : frame === 'start' ? 1 : Math.max(0, 1 - progress * 1.15)
  const scale = keep && frame === 'middle' ? 1.08 : keep ? 1 : Math.max(0.22, 1 - progress * 0.72)
  const travel = keep ? 0 : progress * 0.035
  const x = element.x + offsetX * travel
  const y = element.y + offsetY * travel
  const size = element.size * scale
  const half = size / 2
  const color = escapeAttribute(element.color)
  const common = `opacity="${toNumber(opacity)}"`

  if (settings.shape === 'circle') {
    return `    <circle cx="${toNumber(x)}" cy="${toNumber(y)}" r="${toNumber(half)}" fill="${color}" ${common} />`
  }

  const radius = settings.shape === 'rounded-square' ? size * 0.22 : 0
  const radiusAttributes = radius > 0 ? ` rx="${toNumber(radius)}" ry="${toNumber(radius)}"` : ''

  return `    <rect x="${toNumber(x - half)}" y="${toNumber(y - half)}" width="${toNumber(size)}" height="${toNumber(
    size,
  )}"${radiusAttributes} fill="${color}" ${common} />`
}

export function generateMotionFrameSvg(grid: GeneratedGrid, settings: GeneratorSettings, frame: MotionFrame) {
  const motionElements = getSmartMotionPlan(grid)
  const backgroundRect = settings.transparentBg
    ? ''
    : `    <rect width="${grid.outputSize}" height="${grid.outputSize}" fill="${escapeAttribute(settings.bgColor)}" />`
  const elements = motionElements
    .map(({ element, keep, offsetX, offsetY }) => elementShapeToSvg(element, settings, frame, keep, offsetX, offsetY))
    .filter(Boolean)
    .join('\n')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${grid.outputSize}" height="${grid.outputSize}" viewBox="0 0 ${grid.outputSize} ${grid.outputSize}" role="img">
  <title>Veyra Motion ${frame}</title>
${backgroundRect}
${elements}
</svg>`
}

export function generateMotionSequencePrompt(meta: MotionSequenceMeta) {
  const userPrompt = meta.prompt.trim() || 'ruhiges, hochwertiges Motion Design fuer ein modulares Pixel-Logo'

  return `Veyra Pixel Generator Motion Brief:
Erstelle eine hochwertige 4-6 Sekunden Motion-Design-Sequenz aus drei gelieferten Frames.

Quelle: ${meta.sourceLabel || 'Veyra Pixel Mark'}
Motion-Idee: ${userPrompt}

Frame 01 / Anfang:
Die volle Pixelstruktur ist sichtbar. Viele kleine Module wirken praezise, ruhig und hochwertig, keine hektische Partikelwolke.

Frame 02 / Mitte:
Die unwichtigeren Pixel reduzieren sich geordnet. Die starken Pixel bleiben als Kern sichtbar. Bewegung: leises Verdichten, kleine Skalierung, dezente Tiefenwirkung.

Frame 03 / Ende:
Ein reduziertes, klares Pixelmark bleibt stehen. Das Ende soll wie ein Premium-Brand-Logo wirken, nicht wie ein Effekt.

Look:
Dunkel, modern, Apple/Linear/Vercel-artig, keine Neon-Effekte, keine Cyberpunk-Optik, keine zufaelligen Explosionen. Kamera bleibt ruhig. Timing: langsam rein, klare Mitte, sauberer finaler Hold.`
}

export function generateMotionSequenceHtml(grid: GeneratedGrid, settings: GeneratorSettings, meta: MotionSequenceMeta) {
  const startSvg = generateMotionFrameSvg(grid, settings, 'start')
  const middleSvg = generateMotionFrameSvg(grid, settings, 'middle')
  const endSvg = generateMotionFrameSvg(grid, settings, 'end')
  const brief = generateMotionSequencePrompt(meta)

  return `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Veyra Motion Sequence</title>
    <style>
      :root { color-scheme: dark; background: #070B12; color: #E8EDF4; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        background: #070B12;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        width: min(1180px, calc(100vw - 40px));
        margin: 0 auto;
        padding: 42px 0;
        display: grid;
        gap: 24px;
      }
      header {
        display: grid;
        gap: 10px;
        padding-bottom: 22px;
        border-bottom: 1px solid rgba(255,255,255,.1);
      }
      h1, h2, p { margin: 0; }
      h1 { font-size: 42px; line-height: 1; letter-spacing: 0; }
      h2 { color: #9AA4B2; font-size: 12px; letter-spacing: .12em; text-transform: uppercase; }
      p { color: #9AA4B2; line-height: 1.65; }
      .frames {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 14px;
      }
      article, .brief {
        border: 1px solid rgba(255,255,255,.1);
        border-radius: 18px;
        background: rgba(11,17,24,.82);
        overflow: hidden;
      }
      article header {
        padding: 14px 16px;
        border-bottom: 1px solid rgba(255,255,255,.08);
      }
      .stage {
        display: grid;
        place-items: center;
        aspect-ratio: 1;
        padding: 22px;
      }
      svg { width: 100%; height: auto; display: block; }
      .brief {
        display: grid;
        gap: 14px;
        padding: 18px;
      }
      textarea {
        width: 100%;
        min-height: 280px;
        resize: vertical;
        border: 1px solid rgba(255,255,255,.1);
        border-radius: 12px;
        padding: 14px;
        color: #E8EDF4;
        background: rgba(3,5,8,.58);
        font: 13px/1.55 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      }
      @media (max-width: 820px) {
        .frames { grid-template-columns: 1fr; }
        h1 { font-size: 30px; }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>Veyra Motion Sequence</h1>
        <p>Drei Frames als sauberer Motion-Design-Brief: Anfang, Mitte, Ende.</p>
      </header>
      <section class="frames">
        <article>
          <header><h2>Frame 01 Anfang</h2></header>
          <div class="stage">${startSvg}</div>
        </article>
        <article>
          <header><h2>Frame 02 Mitte</h2></header>
          <div class="stage">${middleSvg}</div>
        </article>
        <article>
          <header><h2>Frame 03 Ende</h2></header>
          <div class="stage">${endSvg}</div>
        </article>
      </section>
      <section class="brief">
        <h2>Motion Prompt</h2>
        <textarea readonly>${escapeHtml(brief)}</textarea>
      </section>
    </main>
  </body>
</html>`
}

export function downloadMotionSequenceHtml(
  grid: GeneratedGrid,
  settings: GeneratorSettings,
  meta: MotionSequenceMeta,
  fileName = 'veyra-motion-sequence.html',
) {
  downloadTextFile(generateMotionSequenceHtml(grid, settings, meta), fileName, 'text/html;charset=utf-8')
}
