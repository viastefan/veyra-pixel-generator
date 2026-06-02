const palette = ['#101821', '#1b2634', '#263140', '#6a738c']

const hashPrompt = (prompt: string) => {
  let hash = 2166136261

  for (let index = 0; index < prompt.length; index += 1) {
    hash ^= prompt.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

const nextRandom = (seed: number) => {
  let value = seed

  return () => {
    value = Math.imul(value ^ (value >>> 15), 1 | value)
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

const clampPrompt = (prompt: string) => prompt.trim().replace(/\s+/g, ' ').slice(0, 120)

export function createLocalPromptSvg(prompt: string) {
  const label = clampPrompt(prompt) || 'Veyra mark'
  const seed = hashPrompt(label)
  const random = nextRandom(seed)
  const cells = 18
  const cellSize = 40
  const center = (cells - 1) / 2
  const radiusX = 4.8 + random() * 2.8
  const radiusY = 4.8 + random() * 2.8
  const twist = (random() - 0.5) * 0.7
  const gap = 1.8 + random() * 3.5
  const blocks: string[] = []

  for (let row = 0; row < cells; row += 1) {
    for (let column = 0; column < cells; column += 1) {
      const mirroredColumn = Math.min(column, cells - 1 - column)
      const dx = mirroredColumn - center + Math.sin(row * 0.75 + seed) * twist
      const dy = row - center
      const distance = (dx * dx) / (radiusX * radiusX) + (dy * dy) / (radiusY * radiusY)
      const line = Math.abs(dx * 0.7 + dy * 0.22) < 0.95 + random() * 0.18
      const edgeNoise = random() > 0.62 && distance < 1.18
      const core = distance < 0.72 && random() > 0.08
      const shouldDraw = core || line || edgeNoise

      if (!shouldDraw) {
        continue
      }

      const strength = Math.max(0, 1 - distance)
      const color = palette[Math.min(palette.length - 1, Math.floor((1 - strength) * palette.length))]
      const size = cellSize - gap - (1 - strength) * 8
      const x = 40 + column * cellSize + (cellSize - size) / 2
      const y = 40 + row * cellSize + (cellSize - size) / 2

      blocks.push(
        `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${size.toFixed(1)}" height="${size.toFixed(
          1,
        )}" rx="${Math.max(3, size * 0.16).toFixed(1)}" fill="${color}" />`,
      )
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
  <rect width="800" height="800" fill="#f6f8fb" />
  <g>${blocks.join('\n    ')}</g>
  <title>${label.replace(/[<>&"]/g, '')}</title>
</svg>`
}
