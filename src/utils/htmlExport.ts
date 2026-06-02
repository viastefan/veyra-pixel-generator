import type { GeneratedGrid, GeneratorSettings, GridElement } from '../types'
import { generateSvg } from './svgExport'

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const toNumber = (value: number) => Number(value.toFixed(3)).toString()

const escapeAttribute = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function getReducedElementIds(grid: GeneratedGrid) {
  const center = grid.outputSize / 2
  const maxDistance = Math.hypot(center, center)
  const targetCount = Math.max(12, Math.min(grid.elements.length, Math.round(grid.elements.length * 0.38)))

  return new Set(
    [...grid.elements]
      .sort((a, b) => {
        const distanceA = Math.hypot(a.x - center, a.y - center) / maxDistance
        const distanceB = Math.hypot(b.x - center, b.y - center) / maxDistance
        const scoreA = a.strength * 1.6 + (1 - distanceA) * 0.55 + (a.tone === 'primary' ? 0.16 : 0)
        const scoreB = b.strength * 1.6 + (1 - distanceB) * 0.55 + (b.tone === 'primary' ? 0.16 : 0)

        return scoreB - scoreA
      })
      .slice(0, targetCount)
      .map((element) => element.id),
  )
}

function animatedElementToSvg(element: GridElement, settings: GeneratorSettings, order: number, keep: boolean) {
  const half = element.size / 2
  const color = escapeAttribute(element.color)
  const className = keep ? 'pixel keep' : 'pixel'
  const commonAttributes = `class="${className}" data-order="${order}" style="--delay:${order}ms;--x:${toNumber(
    element.x - settings.outputSize / 2,
  )}px;--y:${toNumber(element.y - settings.outputSize / 2)}px;transform-origin:${toNumber(element.x)}px ${toNumber(element.y)}px"`

  if (settings.shape === 'circle') {
    return `  <circle ${commonAttributes} cx="${toNumber(element.x)}" cy="${toNumber(element.y)}" r="${toNumber(half)}" fill="${color}" />`
  }

  const x = element.x - half
  const y = element.y - half
  const radius = settings.shape === 'rounded-square' ? element.size * 0.22 : 0
  const radiusAttributes = radius > 0 ? ` rx="${toNumber(radius)}" ry="${toNumber(radius)}"` : ''

  return `  <rect ${commonAttributes} x="${toNumber(x)}" y="${toNumber(y)}" width="${toNumber(element.size)}" height="${toNumber(
    element.size,
  )}"${radiusAttributes} fill="${color}" />`
}

export function generateStandaloneHtml(grid: GeneratedGrid, settings: GeneratorSettings) {
  const svg = generateSvg(grid, settings)
  const background = settings.transparentBg ? '#070B12' : settings.bgColor

  return `<!doctype html>
<html lang="de">
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

export function generateAnimatedHtml(grid: GeneratedGrid, settings: GeneratorSettings) {
  const background = settings.transparentBg ? '#070B12' : settings.bgColor
  const keepIds = getReducedElementIds(grid)
  const sortedElements = [...grid.elements].sort((a, b) => {
    const distanceA = Math.hypot(a.x - grid.outputSize / 2, a.y - grid.outputSize / 2)
    const distanceB = Math.hypot(b.x - grid.outputSize / 2, b.y - grid.outputSize / 2)
    return a.strength - b.strength || distanceA - distanceB
  })
  const maxOrder = Math.max(1, sortedElements.length - 1)
  const backgroundRect = settings.transparentBg ? '' : `  <rect width="${grid.outputSize}" height="${grid.outputSize}" fill="${escapeAttribute(settings.bgColor)}" />`
  const pixels = sortedElements
    .map((element, index) => animatedElementToSvg(element, settings, Math.round((index / maxOrder) * 1600), keepIds.has(element.id)))
    .join('\n')

  return `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Veyra Pixel Animation</title>
    <style>
      :root { color-scheme: dark; background: ${escapeHtml(background)}; }
      * { box-sizing: border-box; }
      body {
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        background: ${escapeHtml(background)};
        color: #e8edf4;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        width: min(78vmin, 920px);
        display: grid;
        gap: 18px;
      }
      svg {
        display: block;
        width: 100%;
        height: auto;
      }
      .stage {
        overflow: hidden;
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 16px;
        background: ${escapeHtml(background)};
      }
      .pixel {
        transition: opacity 360ms cubic-bezier(.2,.8,.2,1), transform 520ms cubic-bezier(.2,.8,.2,1), filter 520ms ease;
        transform-box: fill-box;
      }
      .is-reduced .pixel:not(.keep) {
        opacity: 0;
        transform: translate(calc(var(--x) * .025), calc(var(--y) * .025)) scale(0.18);
        transition-delay: var(--delay);
      }
      .is-reduced .pixel.keep {
        opacity: 1;
        transform: scale(1.08);
        filter: drop-shadow(0 0 8px rgba(232,237,244,.08));
        transition-delay: calc(var(--delay) * .18);
      }
      .is-settled .pixel.keep {
        transform: scale(1);
        filter: none;
      }
      .controls {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        color: #9aa4b2;
        font-size: 14px;
      }
      button {
        min-height: 40px;
        padding: 0 16px;
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 12px;
        color: #e8edf4;
        background: #101821;
        cursor: pointer;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="stage">
        <svg id="mark" xmlns="http://www.w3.org/2000/svg" width="${grid.outputSize}" height="${grid.outputSize}" viewBox="0 0 ${grid.outputSize} ${grid.outputSize}" role="img">
          <title>Veyra Pixel Animation</title>
${backgroundRect}
${pixels}
        </svg>
      </div>
      <div class="controls">
        <span>Smart Motion: viele Pixel verdichten sich zu einem reduzierten Mark</span>
        <button type="button" id="replay">Neu abspielen</button>
      </div>
    </main>
    <script>
      const mark = document.getElementById('mark');
      const replay = document.getElementById('replay');
      const play = () => {
        mark.classList.remove('is-reduced');
        mark.classList.remove('is-settled');
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => mark.classList.add('is-reduced'));
        });
        window.setTimeout(() => mark.classList.add('is-settled'), 2600);
      };
      replay.addEventListener('click', play);
      window.setTimeout(play, 700);
    </script>
  </body>
</html>`
}

export function downloadAnimatedHtml(
  grid: GeneratedGrid,
  settings: GeneratorSettings,
  fileName = 'veyra-pixel-animation.html',
) {
  const html = generateAnimatedHtml(grid, settings)
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}
