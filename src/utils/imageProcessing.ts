import type { GeneratedGrid, GeneratorSettings, GridElement, PreviewBackground } from '../types'

const SAMPLE_SCALE = 5

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const fitContained = (sourceWidth: number, sourceHeight: number, targetSize: number) => {
  const scale = Math.min(targetSize / sourceWidth, targetSize / sourceHeight)
  const width = sourceWidth * scale
  const height = sourceHeight * scale

  return {
    x: (targetSize - width) / 2,
    y: (targetSize - height) / 2,
    width,
    height,
  }
}

export const DEFAULT_SETTINGS: GeneratorSettings = {
  gridSize: 42,
  elementSize: 84,
  smallSquareRatio: 36,
  threshold: 38,
  contrast: 126,
  invert: false,
  tones: 'two',
  shape: 'rounded-square',
  bgColor: '#070B12',
  primaryColor: '#E8EDF4',
  secondaryColor: '#6a738c',
  accentColor: '#6a738c',
  transparentBg: false,
  outputSize: 1200,
  padding: 160,
}

export function computePixelGrid(
  image: HTMLImageElement,
  processingCanvas: HTMLCanvasElement,
  settings: GeneratorSettings,
): GeneratedGrid {
  const sourceWidth = image.naturalWidth || image.width
  const sourceHeight = image.naturalHeight || image.height
  const gridSize = Math.round(clamp(settings.gridSize, 8, 96))
  const sampleSize = gridSize * SAMPLE_SCALE
  const outputSize = Math.round(clamp(settings.outputSize, 512, 2400))
  const padding = Math.round(clamp(settings.padding, 0, outputSize * 0.42))
  const innerSize = Math.max(outputSize - padding * 2, outputSize * 0.1)
  const cellSize = innerSize / gridSize
  const threshold = clamp(settings.threshold / 100, 0.01, 0.99)
  const contrast = clamp(settings.contrast / 100, 0.35, 2.6)
  const elementRatio = clamp(settings.elementSize / 100, 0.08, 1)
  const minRatio = clamp(settings.smallSquareRatio / 100, 0.05, 1)

  processingCanvas.width = sampleSize
  processingCanvas.height = sampleSize

  const context = processingCanvas.getContext('2d', { willReadFrequently: true })

  if (!context) {
    throw new Error('Canvas processing context is not available.')
  }

  context.clearRect(0, 0, sampleSize, sampleSize)
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, sampleSize, sampleSize)

  const drawBox = fitContained(sourceWidth, sourceHeight, sampleSize)
  context.drawImage(image, drawBox.x, drawBox.y, drawBox.width, drawBox.height)

  const imageData = context.getImageData(0, 0, sampleSize, sampleSize).data
  const elements: GridElement[] = []

  for (let row = 0; row < gridSize; row += 1) {
    for (let column = 0; column < gridSize; column += 1) {
      let luminanceTotal = 0
      let samples = 0

      for (let y = 0; y < SAMPLE_SCALE; y += 1) {
        for (let x = 0; x < SAMPLE_SCALE; x += 1) {
          const pixelX = column * SAMPLE_SCALE + x
          const pixelY = row * SAMPLE_SCALE + y
          const index = (pixelY * sampleSize + pixelX) * 4
          const alpha = imageData[index + 3] / 255
          const red = imageData[index] * alpha + 255 * (1 - alpha)
          const green = imageData[index + 1] * alpha + 255 * (1 - alpha)
          const blue = imageData[index + 2] * alpha + 255 * (1 - alpha)
          luminanceTotal += 0.2126 * red + 0.7152 * green + 0.0722 * blue
          samples += 1
        }
      }

      const rawBrightness = luminanceTotal / samples / 255
      const brightness = clamp((rawBrightness - 0.5) * contrast + 0.5, 0, 1)
      const strength = settings.invert ? brightness : 1 - brightness

      if (strength < threshold) {
        continue
      }

      const normalizedStrength = clamp((strength - threshold) / (1 - threshold), 0, 1)
      const size = cellSize * elementRatio * (minRatio + normalizedStrength * (1 - minRatio))
      const tone: GridElement['tone'] =
        settings.tones === 'two' && normalizedStrength < 0.48 ? 'secondary' : 'primary'
      const color = tone === 'primary' ? settings.primaryColor : settings.secondaryColor

      elements.push({
        id: `${row}-${column}`,
        row,
        column,
        x: padding + column * cellSize + cellSize / 2,
        y: padding + row * cellSize + cellSize / 2,
        size,
        brightness,
        strength,
        tone,
        color,
      })
    }
  }

  return {
    elements,
    gridSize,
    outputSize,
    padding,
    cellSize,
    sourceWidth,
    sourceHeight,
  }
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.min(radius, width / 2, height / 2)

  context.beginPath()
  context.moveTo(x + safeRadius, y)
  context.lineTo(x + width - safeRadius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius)
  context.lineTo(x + width, y + height - safeRadius)
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height)
  context.lineTo(x + safeRadius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius)
  context.lineTo(x, y + safeRadius)
  context.quadraticCurveTo(x, y, x + safeRadius, y)
  context.closePath()
}

export function drawPixelMark(
  context: CanvasRenderingContext2D,
  grid: GeneratedGrid,
  settings: GeneratorSettings,
) {
  context.clearRect(0, 0, grid.outputSize, grid.outputSize)

  if (!settings.transparentBg) {
    context.fillStyle = settings.bgColor
    context.fillRect(0, 0, grid.outputSize, grid.outputSize)
  }

  for (const element of grid.elements) {
    const half = element.size / 2
    context.fillStyle = element.color

    if (settings.shape === 'circle') {
      context.beginPath()
      context.arc(element.x, element.y, half, 0, Math.PI * 2)
      context.fill()
      continue
    }

    if (settings.shape === 'rounded-square') {
      drawRoundedRect(context, element.x - half, element.y - half, element.size, element.size, element.size * 0.22)
      context.fill()
      continue
    }

    context.fillRect(element.x - half, element.y - half, element.size, element.size)
  }
}

export function resolvePreviewSettings(settings: GeneratorSettings, previewBackground: PreviewBackground) {
  if (previewBackground === 'transparent') {
    return {
      ...settings,
      transparentBg: true,
    }
  }

  if (previewBackground === 'light') {
    return {
      ...settings,
      transparentBg: false,
      bgColor: '#F2F5F8',
    }
  }

  return {
    ...settings,
    transparentBg: false,
  }
}

export function drawEmptyPreview(
  context: CanvasRenderingContext2D,
  outputSize: number,
  settings: GeneratorSettings,
  previewBackground: PreviewBackground,
) {
  context.clearRect(0, 0, outputSize, outputSize)
  const previewSettings = resolvePreviewSettings(settings, previewBackground)

  if (!previewSettings.transparentBg) {
    context.fillStyle = previewSettings.bgColor
    context.fillRect(0, 0, outputSize, outputSize)
  }
}
