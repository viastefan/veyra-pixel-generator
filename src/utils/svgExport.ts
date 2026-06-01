import type { GeneratedGrid, GeneratorSettings, GridElement } from '../types'

const toNumber = (value: number) => Number(value.toFixed(3)).toString()

const escapeAttribute = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function elementToSvg(element: GridElement, settings: GeneratorSettings) {
  const half = element.size / 2
  const color = escapeAttribute(element.color)

  if (settings.shape === 'circle') {
    return `  <circle cx="${toNumber(element.x)}" cy="${toNumber(element.y)}" r="${toNumber(half)}" fill="${color}" />`
  }

  const x = element.x - half
  const y = element.y - half
  const radius = settings.shape === 'rounded-square' ? element.size * 0.22 : 0
  const radiusAttributes = radius > 0 ? ` rx="${toNumber(radius)}" ry="${toNumber(radius)}"` : ''

  return `  <rect x="${toNumber(x)}" y="${toNumber(y)}" width="${toNumber(element.size)}" height="${toNumber(
    element.size,
  )}"${radiusAttributes} fill="${color}" />`
}

export function generateSvg(grid: GeneratedGrid, settings: GeneratorSettings) {
  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${grid.outputSize}" height="${grid.outputSize}" viewBox="0 0 ${grid.outputSize} ${grid.outputSize}" role="img">`,
    '  <title>Veyra Pixel Mark</title>',
  ]

  if (!settings.transparentBg) {
    lines.push(`  <rect width="${grid.outputSize}" height="${grid.outputSize}" fill="${escapeAttribute(settings.bgColor)}" />`)
  }

  for (const element of grid.elements) {
    lines.push(elementToSvg(element, settings))
  }

  lines.push('</svg>')

  return lines.join('\n')
}

export function downloadSvg(grid: GeneratedGrid, settings: GeneratorSettings, fileName = 'veyra-pixel-mark.svg') {
  const svg = generateSvg(grid, settings)
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}
