import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ChangeEvent, DragEvent, PointerEvent } from 'react'
import type { GeneratorSettings, GeneratedGrid, GridElement, MotifStyle, PreviewBackground, ShapeMode } from './types'
import {
  DEFAULT_SETTINGS,
  computePixelGrid,
  drawEmptyPreview,
  drawPixelMark,
  resolvePreviewSettings,
} from './utils/imageProcessing'
import { downloadPng } from './utils/pngExport'
import { createLocalPromptSvg } from './utils/promptMotif'
import { downloadSvg, generateSvg } from './utils/svgExport'
import { downloadAnimatedHtml, downloadHtml, getSmartMotionPlan } from './utils/htmlExport'
import { downloadSmartMotionVideo } from './utils/videoExport'
import { downloadBrandKitHtml } from './utils/brandKitExport'
import { downloadMotionSequenceHtml, generateMotionSequencePrompt } from './utils/motionSequenceExport'

const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml']
const IMAGE_INPUT_ID = 'veyra-image-input'
const TEXT_FONT_INPUT_ID = 'veyra-text-font-input'
const ACCEPTED_IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|svg)$/i
const ACCEPTED_FONT_EXTENSIONS = /\.(ttf|otf)$/i
const FAVORITES_STORAGE_KEY = 'veyra-pixel-generator:favorites'
const MAX_FAVORITES = 10
type DrawTool = 'primary' | 'secondary' | 'erase' | 'line'
type ManualPixelValue = 'primary' | 'secondary' | 'erase'
type ManualPixelMap = Record<string, ManualPixelValue>
type GridCell = { row: number; column: number }
type LogoRecipe = {
  name: string
  prompt: string
  style: MotifStyle
  settings: Partial<GeneratorSettings>
}
type LogoBrief = {
  name: string
  prompt: string
  style: MotifStyle
  settings?: Partial<GeneratorSettings>
}
type LogoVariant = LogoBrief & {
  settings: Partial<GeneratorSettings>
  id: string
  svg: string
  previewUrl: string
  variant: number
}
type EditorSnapshot = {
  label: string
  settings: GeneratorSettings
  image: HTMLImageElement | null
  imageName: string
  grid: GeneratedGrid | null
  previewBackground: PreviewBackground
  prompt: string
  motifStyle: MotifStyle
  motifVariant: number
  sourcePreviewUrl: string
  sourceSvg: string
  sourceLabel: string
  manualPixels: ManualPixelMap
  drawTool: DrawTool
  brushSize: number
  blankMode: boolean
  drawMode: boolean
  showRaster: boolean
}
type SavedMark = {
  id: string
  name: string
  savedAt: string
  settings: GeneratorSettings
  gridSnapshot?: GeneratedGrid
  previewBackground: PreviewBackground
  prompt: string
  motifStyle: MotifStyle
  motifVariant: number
  sourcePreviewUrl: string
  sourceSvg: string
  sourceLabel: string
  imageName: string
  manualPixels: ManualPixelMap
  blankMode: boolean
  showRaster: boolean
  thumbnailUrl: string
}

const SAMPLE_SOURCE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="720" viewBox="0 0 720 720">
  <rect width="720" height="720" fill="#f6f8fb"/>
  <path d="M360 96 560 252v216L360 624 160 468V252L360 96Z" fill="#101821"/>
  <path d="M360 166 500 275v170L360 554 220 445V275L360 166Z" fill="#f6f8fb"/>
  <path d="M360 240 444 305v110L360 480 276 415V305L360 240Z" fill="#101821"/>
  <rect x="334" y="92" width="52" height="536" fill="#101821"/>
</svg>`

const MOTIF_STYLES: Array<{ value: MotifStyle; label: string }> = [
  { value: 'monogram', label: 'Monogramm' },
  { value: 'emblem', label: 'Emblem' },
  { value: 'orbital', label: 'Orbital' },
  { value: 'signal', label: 'Signal' },
]

const DRAW_TOOLS: Array<{ value: DrawTool; label: string; description: string }> = [
  { value: 'primary', label: '✏️ Pixel', description: 'helle Pixel setzen' },
  { value: 'secondary', label: '🌫️ Schatten', description: 'gedämpfte Pixel setzen' },
  { value: 'erase', label: '🧽 Radierer', description: 'Pixel entfernen' },
  { value: 'line', label: '📏 Linie', description: 'gerade Rasterlinie ziehen' },
]

const PRESETS: Array<{ name: string; settings: Partial<GeneratorSettings> }> = [
  {
    name: 'Veyra Dunkel',
    settings: {
      gridSize: 42,
      elementSize: 84,
      smallSquareRatio: 36,
      threshold: 38,
      contrast: 126,
      pixelSmoothing: 54,
      tones: 'two',
      shape: 'rounded-square',
      bgColor: '#070B12',
      primaryColor: '#E8EDF4',
      secondaryColor: '#6a738c',
      accentColor: '#6a738c',
      transparentBg: false,
    },
  },
  {
    name: '1inch Stil',
    settings: {
      gridSize: 34,
      elementSize: 90,
      smallSquareRatio: 22,
      threshold: 34,
      contrast: 150,
      pixelSmoothing: 42,
      tones: 'two',
      shape: 'square',
      bgColor: '#070B12',
      primaryColor: '#F3F7FF',
      secondaryColor: '#6a738c',
      accentColor: '#6a738c',
      transparentBg: false,
    },
  },
  {
    name: 'Weiche Punkte',
    settings: {
      gridSize: 48,
      elementSize: 76,
      smallSquareRatio: 44,
      threshold: 42,
      contrast: 112,
      pixelSmoothing: 64,
      tones: 'two',
      shape: 'circle',
      bgColor: '#070B12',
      primaryColor: '#EEF3F8',
      secondaryColor: '#6F7A89',
      accentColor: '#6a738c',
      transparentBg: false,
    },
  },
  {
    name: 'Scharfer Pixel',
    settings: {
      gridSize: 58,
      elementSize: 92,
      smallSquareRatio: 18,
      threshold: 46,
      contrast: 168,
      pixelSmoothing: 34,
      tones: 'one',
      shape: 'square',
      bgColor: '#070B12',
      primaryColor: '#E8EDF4',
      secondaryColor: '#6a738c',
      accentColor: '#6a738c',
      transparentBg: false,
    },
  },
]

const LOGO_RECIPES: LogoRecipe[] = [
  {
    name: 'Veyra Sigil',
    prompt: 'premium Veyra sigil, mirrored modular diamond, calm festival tech logo',
    style: 'emblem',
    settings: { gridSize: 44, elementSize: 86, smallSquareRatio: 28, threshold: 36, contrast: 142, pixelSmoothing: 52, shape: 'rounded-square', tones: 'two' },
  },
  {
    name: 'Orbit Seal',
    prompt: 'orbital ring seal, central monogram, precise modular constellation mark',
    style: 'orbital',
    settings: { gridSize: 50, elementSize: 78, smallSquareRatio: 38, threshold: 40, contrast: 132, pixelSmoothing: 58, shape: 'circle', tones: 'two' },
  },
  {
    name: 'Sharp Crest',
    prompt: 'sharp abstract crest, premium angular V mark, high-end black label emblem',
    style: 'emblem',
    settings: { gridSize: 56, elementSize: 92, smallSquareRatio: 18, threshold: 44, contrast: 176, pixelSmoothing: 32, shape: 'square', tones: 'one' },
  },
  {
    name: 'Signal Bloom',
    prompt: 'modular signal flower, geometric bloom, quiet luxury festival symbol',
    style: 'signal',
    settings: { gridSize: 48, elementSize: 82, smallSquareRatio: 42, threshold: 37, contrast: 124, pixelSmoothing: 62, shape: 'rounded-square', tones: 'two' },
  },
  {
    name: 'Compass Core',
    prompt: 'abstract compass core, north star grid, refined Veyra navigation mark',
    style: 'monogram',
    settings: { gridSize: 42, elementSize: 88, smallSquareRatio: 24, threshold: 35, contrast: 152, pixelSmoothing: 48, shape: 'rounded-square', tones: 'two' },
  },
  {
    name: 'Monolith',
    prompt: 'minimal monolith logo, vertical modular totem, elegant pixel brand mark',
    style: 'monogram',
    settings: { gridSize: 38, elementSize: 94, smallSquareRatio: 20, threshold: 42, contrast: 164, pixelSmoothing: 38, shape: 'square', tones: 'two' },
  },
  {
    name: 'Lunar Grid',
    prompt: 'lunar grid emblem, circular moon architecture, soft premium pixel symbol',
    style: 'orbital',
    settings: { gridSize: 52, elementSize: 72, smallSquareRatio: 48, threshold: 39, contrast: 116, pixelSmoothing: 66, shape: 'circle', tones: 'two' },
  },
  {
    name: 'Gate Mark',
    prompt: 'festival gate icon, modular arch, symmetrical high-end venue logo',
    style: 'emblem',
    settings: { gridSize: 46, elementSize: 86, smallSquareRatio: 30, threshold: 38, contrast: 148, pixelSmoothing: 50, shape: 'rounded-square', tones: 'two' },
  },
  {
    name: 'Pulse Stack',
    prompt: 'stacked pulse waveform, vertical rhythm logo, refined modular signal',
    style: 'signal',
    settings: { gridSize: 58, elementSize: 76, smallSquareRatio: 26, threshold: 34, contrast: 156, pixelSmoothing: 44, shape: 'square', tones: 'two' },
  },
  {
    name: 'Prism Node',
    prompt: 'prismatic node system, diamond network, premium modular identity mark',
    style: 'emblem',
    settings: { gridSize: 54, elementSize: 80, smallSquareRatio: 34, threshold: 41, contrast: 138, pixelSmoothing: 56, shape: 'rounded-square', tones: 'two' },
  },
  {
    name: 'Soft Crown',
    prompt: 'soft abstract crown, elegant festival royalty symbol, modular pixel crest',
    style: 'monogram',
    settings: { gridSize: 40, elementSize: 82, smallSquareRatio: 45, threshold: 36, contrast: 118, pixelSmoothing: 68, shape: 'circle', tones: 'two' },
  },
  {
    name: 'Arc System',
    prompt: 'architectural arc system, precise circular modules, luxury tech emblem',
    style: 'orbital',
    settings: { gridSize: 60, elementSize: 74, smallSquareRatio: 32, threshold: 43, contrast: 146, pixelSmoothing: 46, shape: 'rounded-square', tones: 'two' },
  },
]

function isSupportedImage(file: File) {
  if (ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return true
  }

  return ACCEPTED_IMAGE_EXTENSIONS.test(file.name)
}

function isSupportedFont(file: File) {
  return ACCEPTED_FONT_EXTENSIONS.test(file.name)
}

function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png') {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
        return
      }

      reject(new Error('Canvas konnte keine Bilddatei erzeugen.'))
    }, type)
  })
}

function createImageFromBlob(blob: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.decoding = 'async'

    image.onload = () => {
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)

      if (!image.naturalWidth || !image.naturalHeight) {
        reject(new Error('Das Bild wurde geladen, hat aber keine lesbaren Maße.'))
        return
      }

      resolve(image)
    }

    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Das ausgewählte Bild konnte nicht geladen werden.'))
    }

    image.src = url
  })
}

function getImageFileFromList(files: FileList | File[]) {
  return Array.from(files).find(isSupportedImage) ?? null
}

function readBlobAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Die Quellvorschau konnte nicht erstellt werden.'))
    reader.readAsDataURL(blob)
  })
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

async function createImageFromDataUrl(dataUrl: string) {
  const response = await fetch(dataUrl)
  const blob = await response.blob()
  return createImageFromBlob(blob)
}

const clampNumber = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const cellKey = (cell: GridCell) => `${cell.row}-${cell.column}`

const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

const svgToDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

function readSavedMarks() {
  try {
    if (typeof window === 'undefined') {
      return []
    }

    const rawValue = window.localStorage.getItem(FAVORITES_STORAGE_KEY)

    if (!rawValue) {
      return []
    }

    const parsed = JSON.parse(rawValue) as SavedMark[]

    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .filter((mark) => typeof mark.id === 'string' && typeof mark.name === 'string' && typeof mark.thumbnailUrl === 'string')
      .slice(0, MAX_FAVORITES)
  } catch {
    return []
  }
}

function parseCellKey(key: string): GridCell | null {
  const [row, column] = key.split('-').map(Number)

  if (!Number.isInteger(row) || !Number.isInteger(column)) {
    return null
  }

  return { row, column }
}

function createBlankGrid(settings: GeneratorSettings): GeneratedGrid {
  const gridSize = Math.round(clampNumber(settings.gridSize, 8, 96))
  const outputSize = Math.round(clampNumber(settings.outputSize, 512, 2400))
  const padding = Math.round(clampNumber(settings.padding, 0, outputSize * 0.42))
  const innerSize = Math.max(outputSize - padding * 2, outputSize * 0.1)

  return {
    elements: [],
    gridSize,
    outputSize,
    padding,
    cellSize: innerSize / gridSize,
    sourceWidth: gridSize,
    sourceHeight: gridSize,
  }
}

function getManualElement(grid: GeneratedGrid, settings: GeneratorSettings, cell: GridCell, tone: 'primary' | 'secondary') {
  const threshold = clampNumber(settings.threshold / 100, 0.01, 0.99)
  const elementRatio = clampNumber(settings.elementSize / 100, 0.08, 1)
  const minRatio = clampNumber(settings.smallSquareRatio / 100, 0.05, 1)
  const strength = tone === 'primary' ? 0.9 : 0.58

  if (strength < threshold) {
    return null
  }

  const normalizedStrength = clampNumber((strength - threshold) / (1 - threshold), 0, 1)
  const size = grid.cellSize * elementRatio * (minRatio + normalizedStrength * (1 - minRatio))
  const color = tone === 'primary' ? settings.primaryColor : settings.secondaryColor

  return {
    id: cellKey(cell),
    row: cell.row,
    column: cell.column,
    x: grid.padding + cell.column * grid.cellSize + grid.cellSize / 2,
    y: grid.padding + cell.row * grid.cellSize + grid.cellSize / 2,
    size,
    brightness: tone === 'primary' ? 0 : 0.36,
    strength,
    tone,
    color,
  }
}

function applyManualPixels(grid: GeneratedGrid, edits: ManualPixelMap, settings: GeneratorSettings): GeneratedGrid {
  const editedElements: GridElement[] = []
  const existingKeys = new Set<string>()

  for (const element of grid.elements) {
    existingKeys.add(element.id)
    const edit = edits[element.id]

    if (edit === 'erase') {
      continue
    }

    if (edit === 'primary' || edit === 'secondary') {
      const manualElement = getManualElement(grid, settings, element, edit)

      if (manualElement) {
        editedElements.push(manualElement)
      }

      continue
    }

    editedElements.push(element)
  }

  for (const [key, edit] of Object.entries(edits)) {
    if (edit === 'erase' || existingKeys.has(key)) {
      continue
    }

    const cell = parseCellKey(key)

    if (!cell || cell.row < 0 || cell.column < 0 || cell.row >= grid.gridSize || cell.column >= grid.gridSize) {
      continue
    }

    const manualElement = getManualElement(grid, settings, cell, edit)

    if (manualElement) {
      editedElements.push(manualElement)
    }
  }

  return {
    ...grid,
    elements: editedElements,
  }
}

function adaptGridToSettings(grid: GeneratedGrid, settings: GeneratorSettings): GeneratedGrid {
  const outputSize = Math.round(clampNumber(settings.outputSize, 512, 2400))
  const padding = Math.round(clampNumber(settings.padding, 0, outputSize * 0.42))
  const innerSize = Math.max(outputSize - padding * 2, outputSize * 0.1)
  const cellSize = innerSize / grid.gridSize
  const threshold = clampNumber(settings.threshold / 100, 0.01, 0.99)
  const elementRatio = clampNumber(settings.elementSize / 100, 0.08, 1)
  const minRatio = clampNumber(settings.smallSquareRatio / 100, 0.05, 1)

  return {
    ...grid,
    outputSize,
    padding,
    cellSize,
    elements: grid.elements
      .filter((element) => element.strength >= threshold)
      .map((element) => {
        const normalizedStrength = clampNumber((element.strength - threshold) / (1 - threshold), 0, 1)
        const tone: GridElement['tone'] =
          settings.tones === 'two' && normalizedStrength < 0.48 ? 'secondary' : 'primary'

        return {
          ...element,
          x: padding + element.column * cellSize + cellSize / 2,
          y: padding + element.row * cellSize + cellSize / 2,
          size: cellSize * elementRatio * (minRatio + normalizedStrength * (1 - minRatio)),
          tone,
          color: tone === 'primary' ? settings.primaryColor : settings.secondaryColor,
        }
      }),
  }
}

function cloneGrid(grid: GeneratedGrid): GeneratedGrid {
  return {
    ...grid,
    elements: grid.elements.map((element) => ({ ...element })),
  }
}

function getBrushCells(center: GridCell, gridSize: number, brushSize: number) {
  const cells: GridCell[] = []
  const radius = Math.max(0, Math.floor((brushSize - 1) / 2))

  for (let row = center.row - radius; row <= center.row + radius; row += 1) {
    for (let column = center.column - radius; column <= center.column + radius; column += 1) {
      if (row >= 0 && column >= 0 && row < gridSize && column < gridSize) {
        cells.push({ row, column })
      }
    }
  }

  return cells
}

function getLineCells(start: GridCell, end: GridCell) {
  const cells: GridCell[] = []
  let x0 = start.column
  let y0 = start.row
  const x1 = end.column
  const y1 = end.row
  const dx = Math.abs(x1 - x0)
  const sx = x0 < x1 ? 1 : -1
  const dy = -Math.abs(y1 - y0)
  const sy = y0 < y1 ? 1 : -1
  let error = dx + dy

  while (true) {
    cells.push({ row: y0, column: x0 })

    if (x0 === x1 && y0 === y1) {
      break
    }

    const doubleError = 2 * error

    if (doubleError >= dy) {
      error += dy
      x0 += sx
    }

    if (doubleError <= dx) {
      error += dx
      y0 += sy
    }
  }

  return cells
}

function drawRasterOverlay(
  context: CanvasRenderingContext2D,
  grid: GeneratedGrid,
  hoverCell: GridCell | null,
  showRaster: boolean,
) {
  if (showRaster) {
    context.save()
    context.strokeStyle = 'rgba(232, 237, 244, 0.08)'
    context.lineWidth = Math.max(1, grid.outputSize / 1400)

    for (let index = 0; index <= grid.gridSize; index += 1) {
      const position = grid.padding + index * grid.cellSize
      context.beginPath()
      context.moveTo(grid.padding, position)
      context.lineTo(grid.outputSize - grid.padding, position)
      context.stroke()
      context.beginPath()
      context.moveTo(position, grid.padding)
      context.lineTo(position, grid.outputSize - grid.padding)
      context.stroke()
    }

    context.restore()
  }

  if (!hoverCell) {
    return
  }

  context.save()
  context.strokeStyle = 'rgba(232, 237, 244, 0.8)'
  context.lineWidth = Math.max(2, grid.outputSize / 900)
  context.strokeRect(
    grid.padding + hoverCell.column * grid.cellSize,
    grid.padding + hoverCell.row * grid.cellSize,
    grid.cellSize,
    grid.cellSize,
  )
  context.restore()
}

function drawLinePreview(
  context: CanvasRenderingContext2D,
  grid: GeneratedGrid,
  start: GridCell | null,
  end: GridCell | null,
  brushSize: number,
) {
  if (!start || !end) {
    return
  }

  const previewCells = new Map<string, GridCell>()

  for (const lineCell of getLineCells(start, end)) {
    for (const brushCell of getBrushCells(lineCell, grid.gridSize, brushSize)) {
      previewCells.set(cellKey(brushCell), brushCell)
    }
  }

  context.save()
  context.fillStyle = 'rgba(232, 237, 244, 0.22)'
  context.strokeStyle = 'rgba(232, 237, 244, 0.68)'
  context.lineWidth = Math.max(1, grid.outputSize / 1200)

  for (const cell of previewCells.values()) {
    const inset = grid.cellSize * 0.18
    const x = grid.padding + cell.column * grid.cellSize + inset
    const y = grid.padding + cell.row * grid.cellSize + inset
    const size = grid.cellSize - inset * 2
    context.fillRect(x, y, size, size)
    context.strokeRect(x, y, size, size)
  }

  context.restore()
}

function SliderControl({
  label,
  min,
  max,
  step = 1,
  value,
  suffix = '',
  onChange,
}: {
  label: string
  min: number
  max: number
  step?: number
  value: number
  suffix?: string
  onChange: (value: number) => void
}) {
  const updateValue = (nextValue: number) => {
    if (!Number.isFinite(nextValue)) {
      return
    }

    onChange(Math.min(max, Math.max(min, nextValue)))
  }

  return (
    <label className="control">
      <span className="control-row">
        <span>{label}</span>
        <span className="slider-value">
          <input
            aria-label={`${label} Wert`}
            type="number"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(event) => updateValue(Number(event.target.value))}
          />
          {suffix && <span>{suffix}</span>}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => updateValue(Number(event.target.value))}
      />
    </label>
  )
}

function ColorControl({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="color-control">
      <span>{label}</span>
      <span className="color-input-shell">
        <input type="color" value={value} onChange={(event) => onChange(event.target.value)} />
        <code>{value.toUpperCase()}</code>
      </span>
    </label>
  )
}

function MotionPreview({
  grid,
  settings,
  playKey,
}: {
  grid: GeneratedGrid | null
  settings: GeneratorSettings
  playKey: number
}) {
  const motionElements = useMemo(() => (grid ? getSmartMotionPlan(grid) : []), [grid])

  if (!grid || !motionElements.length) {
    return (
      <div className="motion-empty">
        <span>Erzeuge oder zeichne ein Motiv.</span>
      </div>
    )
  }

  return (
    <div className="motion-stage" key={playKey}>
      <svg
        className="motion-svg is-reducing"
        xmlns="http://www.w3.org/2000/svg"
        width={grid.outputSize}
        height={grid.outputSize}
        viewBox={`0 0 ${grid.outputSize} ${grid.outputSize}`}
        aria-label="Smart-Motion Vorschau"
      >
        {!settings.transparentBg && <rect width={grid.outputSize} height={grid.outputSize} fill={settings.bgColor} />}
        {motionElements.map(({ element, keep, order, offsetX, offsetY }) => {
          const half = element.size / 2
          const style = {
            '--delay': `${order}ms`,
            '--x': `${offsetX}px`,
            '--y': `${offsetY}px`,
            transformOrigin: `${element.x}px ${element.y}px`,
          } as CSSProperties
          const className = keep ? 'motion-pixel keep' : 'motion-pixel'

          if (settings.shape === 'circle') {
            return (
              <circle
                className={className}
                style={style}
                key={element.id}
                cx={element.x}
                cy={element.y}
                r={half}
                fill={element.color}
              />
            )
          }

          const radius = settings.shape === 'rounded-square' ? element.size * 0.22 : 0

          return (
            <rect
              className={className}
              style={style}
              key={element.id}
              x={element.x - half}
              y={element.y - half}
              width={element.size}
              height={element.size}
              rx={radius}
              ry={radius}
              fill={element.color}
            />
          )
        })}
      </svg>
    </div>
  )
}

function App() {
  const [settings, setSettings] = useState<GeneratorSettings>(DEFAULT_SETTINGS)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [imageName, setImageName] = useState('')
  const [grid, setGrid] = useState<GeneratedGrid | null>(null)
  const [previewBackground, setPreviewBackground] = useState<PreviewBackground>('dark')
  const [isDragging, setIsDragging] = useState(false)
  const [isLoadingImage, setIsLoadingImage] = useState(false)
  const [prompt, setPrompt] = useState('minimal Veyra monogram, modular premium festival mark')
  const [motifStyle, setMotifStyle] = useState<MotifStyle>('monogram')
  const [motifVariant, setMotifVariant] = useState(0)
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false)
  const [isGeneratingLogoLab, setIsGeneratingLogoLab] = useState(false)
  const [isExportingVideo, setIsExportingVideo] = useState(false)
  const [textSourceValue, setTextSourceValue] = useState('VEYRA')
  const [textFontFamily, setTextFontFamily] = useState('Inter, ui-sans-serif, system-ui, sans-serif')
  const [textFontLabel, setTextFontLabel] = useState('Systemschrift')
  const [isLoadingTextFont, setIsLoadingTextFont] = useState(false)
  const [motionPrompt, setMotionPrompt] = useState('ruhiges Verdichten von vielen Pixeln zu einem klaren Premium-Mark')
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState('')
  const [sourceSvg, setSourceSvg] = useState('')
  const [sourceLabel, setSourceLabel] = useState('Keine Quelle geladen')
  const [manualPixels, setManualPixels] = useState<ManualPixelMap>({})
  const [drawTool, setDrawTool] = useState<DrawTool>('primary')
  const [brushSize, setBrushSize] = useState(1)
  const [hoverCell, setHoverCell] = useState<GridCell | null>(null)
  const [lineStart, setLineStart] = useState<GridCell | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [blankMode, setBlankMode] = useState(false)
  const [drawMode, setDrawMode] = useState(false)
  const [showRaster, setShowRaster] = useState(true)
  const [motionPlayKey, setMotionPlayKey] = useState(0)
  const [logoRecipeCursor, setLogoRecipeCursor] = useState(0)
  const [logoVariants, setLogoVariants] = useState<LogoVariant[]>([])
  const [savedMarks, setSavedMarks] = useState<SavedMark[]>(() => readSavedMarks())
  const [undoDepth, setUndoDepth] = useState(0)
  const [status, setStatus] = useState('Bild laden, einfügen oder direkt zeichnen.')

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const textFontInputRef = useRef<HTMLInputElement | null>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const processingCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const dragDepthRef = useRef(0)
  const motifStyleRef = useRef<MotifStyle>('monogram')
  const lastPaintedKeyRef = useRef('')
  const lastPaintedCellRef = useRef<GridCell | null>(null)
  const historyRef = useRef<EditorSnapshot[]>([])

  const createSnapshot = useCallback(
    (label: string): EditorSnapshot => ({
      label,
      settings: { ...settings },
      image,
      imageName,
      grid,
      previewBackground,
      prompt,
      motifStyle,
      motifVariant,
      sourcePreviewUrl,
      sourceSvg,
      sourceLabel,
      manualPixels: { ...manualPixels },
      drawTool,
      brushSize,
      blankMode,
      drawMode,
      showRaster,
    }),
    [
      blankMode,
      brushSize,
      drawMode,
      drawTool,
      grid,
      image,
      imageName,
      manualPixels,
      motifStyle,
      motifVariant,
      previewBackground,
      prompt,
      settings,
      showRaster,
      sourceLabel,
      sourcePreviewUrl,
      sourceSvg,
    ],
  )

  const pushUndoSnapshot = useCallback(
    (label: string) => {
      historyRef.current = [...historyRef.current, createSnapshot(label)].slice(-80)
      setUndoDepth(historyRef.current.length)
    },
    [createSnapshot],
  )

  const handleUndo = useCallback(() => {
    const snapshot = historyRef.current.at(-1)

    if (!snapshot) {
      setStatus('Kein Schritt zum Zurückgehen.')
      return
    }

    historyRef.current = historyRef.current.slice(0, -1)
    setUndoDepth(historyRef.current.length)
    setSettings(snapshot.settings)
    setImage(snapshot.image)
    setImageName(snapshot.imageName)
    setGrid(snapshot.grid)
    setPreviewBackground(snapshot.previewBackground)
    setPrompt(snapshot.prompt)
    setMotifStyle(snapshot.motifStyle)
    motifStyleRef.current = snapshot.motifStyle
    setMotifVariant(snapshot.motifVariant)
    setSourcePreviewUrl(snapshot.sourcePreviewUrl)
    setSourceSvg(snapshot.sourceSvg)
    setSourceLabel(snapshot.sourceLabel)
    setManualPixels(snapshot.manualPixels)
    setDrawTool(snapshot.drawTool)
    setBrushSize(snapshot.brushSize)
    setBlankMode(snapshot.blankMode)
    setDrawMode(snapshot.drawMode)
    setShowRaster(snapshot.showRaster)
    setLineStart(null)
    setIsDrawing(false)
    lastPaintedKeyRef.current = ''
    lastPaintedCellRef.current = null
    setMotionPlayKey((current) => current + 1)
    setStatus(`Zurück: ${snapshot.label}`)
  }, [])

  const updateSetting = useCallback(<Key extends keyof GeneratorSettings>(key: Key, value: GeneratorSettings[Key]) => {
    if (settings[key] !== value) {
      pushUndoSnapshot('Einstellung geändert')
    }

    setSettings((current) => ({
      ...current,
      [key]: value,
    }))
  }, [pushUndoSnapshot, settings])

  const loadImageFile = useCallback(async (file: File, options: { sourceSvg?: string; sourceLabel?: string; skipUndo?: boolean } = {}) => {
    if (!isSupportedImage(file)) {
      setStatus('Nutze PNG, JPG, JPEG, WEBP oder SVG.')
      return
    }

    if (file.size === 0) {
      setStatus('Diese Bilddatei ist leer.')
      return
    }

    try {
      if (!options.skipUndo) {
        pushUndoSnapshot('Quelle geladen')
      }

      setIsLoadingImage(true)
      setStatus(`${file.name || 'Bild'} wird geladen...`)
      const nextImage = await createImageFromBlob(file)
      const previewUrl = await readBlobAsDataUrl(file)
      setImage(nextImage)
      setImageName(file.name || 'Bild aus der Zwischenablage')
      setSourcePreviewUrl(previewUrl)
      setSourceSvg(options.sourceSvg ?? '')
      setSourceLabel(options.sourceLabel ?? 'Importierte Quelle')
      setManualPixels({})
      setBlankMode(false)
      setDrawMode(false)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Bild konnte nicht geladen werden.')
    } finally {
      setIsLoadingImage(false)
    }
  }, [pushUndoSnapshot])

  const loadSvgSource = useCallback(
    async (svg: string, fileName: string, sourceLabel = 'Erzeugte Quell-SVG', options: { skipUndo?: boolean } = {}) => {
      const file = new File([svg], fileName, { type: 'image/svg+xml' })
      await loadImageFile(file, { sourceSvg: svg, sourceLabel, skipUndo: options.skipUndo })
    },
    [loadImageFile],
  )

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files ? getImageFileFromList(event.target.files) : null

    if (file) {
      void loadImageFile(file)
    } else if (event.target.files?.length) {
      setStatus('Nutze PNG, JPG, JPEG, WEBP oder SVG.')
    }

    event.target.value = ''
  }

  const handleTextFontInput = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    if (!isSupportedFont(file)) {
      setStatus('Nutze eine TTF- oder OTF-Schriftdatei.')
      event.target.value = ''
      return
    }

    if (!('FontFace' in window)) {
      setStatus('Dieser Browser kann Schriftdateien nicht direkt laden.')
      event.target.value = ''
      return
    }

    try {
      setIsLoadingTextFont(true)
      setStatus(`${file.name} wird als Schrift geladen...`)
      const dataUrl = await readBlobAsDataUrl(file)
      const familyName = `VeyraTextFont${Date.now()}`
      const fontFace = new FontFace(familyName, `url(${dataUrl})`)
      const loadedFont = await fontFace.load()
      document.fonts.add(loadedFont)
      setTextFontFamily(`"${familyName}"`)
      setTextFontLabel(file.name)
      setStatus(`${file.name} geladen. Text kann jetzt gepixelt werden.`)
    } catch {
      setStatus('Schrift konnte nicht geladen werden.')
    } finally {
      setIsLoadingTextFont(false)
      event.target.value = ''
    }
  }

  const createTextPixelSource = async () => {
    const lines = textSourceValue
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 4)

    if (!lines.length) {
      setStatus('Schreibe zuerst einen Text.')
      return
    }

    try {
      if ('fonts' in document) {
        await document.fonts.ready
      }

      const canvas = document.createElement('canvas')
      canvas.width = 1200
      canvas.height = 1200

      const context = canvas.getContext('2d')

      if (!context) {
        throw new Error('Text-Canvas konnte nicht erstellt werden.')
      }

      context.fillStyle = '#f6f8fb'
      context.fillRect(0, 0, canvas.width, canvas.height)

      let fontSize = lines.length > 1 ? 250 : 340
      const maxWidth = 940
      const maxHeight = 760

      while (fontSize > 72) {
        context.font = `760 ${fontSize}px ${textFontFamily}`
        const widestLine = Math.max(...lines.map((line) => context.measureText(line).width))
        const totalHeight = lines.length * fontSize * 1.08

        if (widestLine <= maxWidth && totalHeight <= maxHeight) {
          break
        }

        fontSize -= 8
      }

      const lineHeight = fontSize * 1.08
      const startY = canvas.height / 2 - ((lines.length - 1) * lineHeight) / 2

      context.font = `760 ${fontSize}px ${textFontFamily}`
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillStyle = '#101821'

      for (const [index, line] of lines.entries()) {
        context.fillText(line, canvas.width / 2, startY + index * lineHeight)
      }

      const blob = await canvasToBlob(canvas)
      const file = new File([blob], 'veyra-text-source.png', { type: 'image/png' })
      await loadImageFile(file, { sourceLabel: 'Textquelle' })
      const label = lines.join(' / ').slice(0, 64)
      setSourceLabel(`Textquelle: ${label}`)
      setImageName(`${label} · ${textFontLabel}`)
      setStatus('Textquelle erzeugt. Du kannst sie pixeln, animieren und exportieren.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Textquelle konnte nicht erzeugt werden.')
    }
  }

  const openFilePicker = () => {
    fileInputRef.current?.click()
  }

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    dragDepthRef.current = 0
    setIsDragging(false)

    const file = getImageFileFromList(event.dataTransfer.files)

    if (file) {
      void loadImageFile(file)
      return
    }

    setStatus('Ziehe eine Bilddatei hierher oder starte mit leerem Raster.')
  }

  const handleDragEnter = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    dragDepthRef.current += 1
    setIsDragging(true)
  }

  const handleDragLeave = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)

    if (dragDepthRef.current === 0) {
      setIsDragging(false)
    }
  }

  const pasteFromClipboard = useCallback(async () => {
    if (!navigator.clipboard?.read) {
      setStatus('Drücke Cmd+V oder Ctrl+V, nachdem du ein Bild kopiert hast.')
      return
    }

    try {
      setStatus('Zwischenablage wird gelesen...')
      const items = await navigator.clipboard.read()

      for (const item of items) {
        const imageType = item.types.find((type) => type.startsWith('image/'))

        if (!imageType) {
          continue
        }

        const blob = await item.getType(imageType)
        const file = new File([blob], 'clipboard-image.png', { type: imageType })
        await loadImageFile(file)
        return
      }

      setStatus('In der Zwischenablage ist kein Bild.')
    } catch {
      setStatus('Keine Berechtigung für die Zwischenablage. Probiere Cmd+V oder Ctrl+V.')
    }
  }, [loadImageFile])

  const loadSampleSource = useCallback(async () => {
    await loadSvgSource(SAMPLE_SOURCE_SVG, 'veyra-test-source.svg', 'Testquelle SVG')
  }, [loadSvgSource])

  const updateMotifStyle = (style: MotifStyle) => {
    motifStyleRef.current = style
    setMotifStyle(style)
  }

  const generatePromptMotif = async (variant = motifVariant) => {
    const cleanPrompt = prompt.trim()
    const activeStyle = motifStyleRef.current

    if (!cleanPrompt) {
      setStatus('Gib zuerst einen Prompt ein.')
      return
    }

    try {
      setIsGeneratingPrompt(true)
      setStatus('Motiv wird erzeugt...')

      const response = await fetch('/api/generate-pixel-motif', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: cleanPrompt, style: activeStyle, variant }),
      })

      if (!response.ok) {
        throw new Error('Claude ist noch nicht eingerichtet. Lokale Motiv-Erzeugung wird genutzt.')
      }

      const data = (await response.json()) as { svg?: unknown; source?: unknown }

      if (typeof data.svg !== 'string' || !data.svg.includes('<svg')) {
        throw new Error('Claude hat kein nutzbares SVG geliefert. Lokale Motiv-Erzeugung wird genutzt.')
      }

      await loadSvgSource(data.svg, 'claude-pixel-source.svg', `Claude ${activeStyle} Quelle`)
      setStatus(data.source === 'claude' ? 'Claude-Motiv erzeugt.' : 'Motiv erzeugt.')
    } catch {
      await loadSvgSource(createLocalPromptSvg(cleanPrompt, { style: activeStyle, variant }), 'local-prompt-source.svg', `Lokale ${activeStyle} Quelle`)
      setStatus('Lokales Prompt-Motiv erzeugt. Setze ANTHROPIC_API_KEY in Vercel, um Claude zu nutzen.')
    } finally {
      setIsGeneratingPrompt(false)
    }
  }

  const generateNextVariant = () => {
    const nextVariant = motifVariant + 1
    setMotifVariant(nextVariant)
    void generatePromptMotif(nextVariant)
  }

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const fileFromList = event.clipboardData?.files ? getImageFileFromList(event.clipboardData.files) : null

      if (fileFromList) {
        event.preventDefault()
        void loadImageFile(fileFromList)
        return
      }

      const item = Array.from(event.clipboardData?.items ?? []).find((candidate) => candidate.type.startsWith('image/'))

      if (!item) {
        return
      }

      const file = item.getAsFile()

      if (!file) {
        return
      }

      event.preventDefault()
      void loadImageFile(file)
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [loadImageFile])

  useEffect(() => {
    try {
      window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(savedMarks.slice(0, MAX_FAVORITES)))
    } catch {
      setStatus('Favoriten-Speicher ist voll. Lösche alte Favoriten.')
    }
  }, [savedMarks])

  useEffect(() => {
    if (!image || !processingCanvasRef.current) {
      return
    }

    try {
      const nextGrid = computePixelGrid(image, processingCanvasRef.current, settings)
      setGrid(nextGrid)
      setStatus(
        nextGrid.elements.length
          ? 'Bild geladen. Du kannst es justieren, überzeichnen oder exportieren.'
          : 'Noch keine Pixel erzeugt. Senke die Schwelle oder aktiviere Invertieren.',
      )
    } catch (error) {
      setGrid(null)
      setStatus(error instanceof Error ? error.message : 'Das Motiv konnte nicht erzeugt werden.')
    }
  }, [image, settings])

  const blankGrid = useMemo(() => createBlankGrid(settings), [settings])

  const baseGrid = useMemo(() => {
    if (grid) {
      return grid
    }

    if (blankMode || drawMode || Object.keys(manualPixels).length > 0) {
      return blankGrid
    }

    return null
  }, [blankGrid, blankMode, drawMode, grid, manualPixels])

  const activeGrid = useMemo(() => {
    if (!baseGrid) {
      return null
    }

    return applyManualPixels(adaptGridToSettings(baseGrid, settings), manualPixels, settings)
  }, [baseGrid, manualPixels, settings])

  const workingGrid = activeGrid ?? blankGrid

  const manualPixelCount = useMemo(
    () => Object.values(manualPixels).filter((value) => value === 'primary' || value === 'secondary').length,
    [manualPixels],
  )

  const getCellFromPointer = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = previewCanvasRef.current

    if (!canvas) {
      return null
    }

    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * workingGrid.outputSize
    const y = ((event.clientY - rect.top) / rect.height) * workingGrid.outputSize
    const column = Math.floor((x - workingGrid.padding) / workingGrid.cellSize)
    const row = Math.floor((y - workingGrid.padding) / workingGrid.cellSize)

    if (row < 0 || column < 0 || row >= workingGrid.gridSize || column >= workingGrid.gridSize) {
      return null
    }

    return { row, column }
  }

  const paintCells = (cells: GridCell[], value: ManualPixelValue) => {
    if (!cells.length) {
      return
    }

    setBlankMode((current) => current || !grid)
    setManualPixels((current) => {
      const next = { ...current }

      for (const cell of cells) {
        next[cellKey(cell)] = value
      }

      return next
    })
  }

  const paintCell = (cell: GridCell) => {
    const value: ManualPixelValue = drawTool === 'erase' ? 'erase' : drawTool === 'secondary' ? 'secondary' : 'primary'
    paintCells(getBrushCells(cell, workingGrid.gridSize, brushSize), value)
  }

  const paintCellPath = (from: GridCell | null, to: GridCell) => {
    const value: ManualPixelValue = drawTool === 'erase' ? 'erase' : drawTool === 'secondary' ? 'secondary' : 'primary'
    const pathCells = from ? getLineCells(from, to) : [to]
    const brushCells = pathCells.flatMap((cell) => getBrushCells(cell, workingGrid.gridSize, brushSize))
    paintCells(brushCells, value)
  }

  const handleCanvasPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawMode) {
      return
    }

    const cell = getCellFromPointer(event)

    if (!cell) {
      return
    }

    event.preventDefault()
    pushUndoSnapshot(drawTool === 'line' ? 'Pixellinie' : 'Pixelzeichnung')
    event.currentTarget.setPointerCapture(event.pointerId)
    setHoverCell(cell)

    if (drawTool === 'line') {
      setLineStart(cell)
      setStatus('Linie gestartet. Ziehe bis zum Ziel und lass los.')
      return
    }

    setIsDrawing(true)
    lastPaintedKeyRef.current = ''
    lastPaintedCellRef.current = cell
    paintCell(cell)
  }

  const handleCanvasPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawMode) {
      return
    }

    const cell = getCellFromPointer(event)
    setHoverCell(cell)

    if (!cell || !isDrawing || drawTool === 'line') {
      return
    }

    const key = cellKey(cell)

    if (key === lastPaintedKeyRef.current) {
      return
    }

    lastPaintedKeyRef.current = key
    paintCellPath(lastPaintedCellRef.current, cell)
    lastPaintedCellRef.current = cell
  }

  const handleCanvasPointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawMode) {
      return
    }

    const cell = getCellFromPointer(event)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    if (drawTool === 'line' && lineStart && cell) {
      paintCells(
        getLineCells(lineStart, cell).flatMap((lineCell) => getBrushCells(lineCell, workingGrid.gridSize, brushSize)),
        'primary',
      )
      setStatus('Pixellinie gesetzt.')
    }

    setLineStart(null)
    setIsDrawing(false)
    lastPaintedKeyRef.current = ''
    lastPaintedCellRef.current = null
  }

  const handleCanvasPointerLeave = () => {
    setHoverCell(null)

    if (drawTool !== 'line') {
      setIsDrawing(false)
      lastPaintedCellRef.current = null
    }
  }

  useEffect(() => {
    const canvas = previewCanvasRef.current

    if (!canvas) {
      return
    }

    canvas.width = settings.outputSize
    canvas.height = settings.outputSize

    const context = canvas.getContext('2d')

    if (!context) {
      return
    }

    if (!activeGrid) {
      drawEmptyPreview(context, settings.outputSize, settings, previewBackground)
      return
    }

    drawPixelMark(context, activeGrid, resolvePreviewSettings(settings, previewBackground))
    drawRasterOverlay(context, activeGrid, hoverCell, showRaster)
    drawLinePreview(context, activeGrid, drawMode && drawTool === 'line' ? lineStart : null, hoverCell, brushSize)
  }, [activeGrid, brushSize, drawMode, drawTool, hoverCell, lineStart, previewBackground, settings, showRaster])

  const sourceMeta = useMemo(() => {
    if (!activeGrid) {
      return 'Keine Quelle geladen'
    }

    return `${activeGrid.sourceWidth} x ${activeGrid.sourceHeight} Quelle, ${activeGrid.elements.length} Pixel`
  }, [activeGrid])

  const hasArtwork = Boolean(activeGrid?.elements.length)
  const canUndo = undoDepth > 0

  const saveCurrentMark = () => {
    if (!activeGrid || !activeGrid.elements.length) {
      setStatus('Erzeuge oder zeichne zuerst ein Motiv.')
      return
    }

    const savedAt = new Date().toISOString()
    const dateLabel = new Intl.DateTimeFormat('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
    }).format(new Date(savedAt))
    const baseName = sourceLabel && sourceLabel !== 'Keine Quelle geladen' ? sourceLabel : 'Veyra Mark'
    const storedSourcePreviewUrl = sourceSvg ? svgToDataUrl(sourceSvg) : ''
    const nextMark: SavedMark = {
      id: `${Date.now()}-${Math.round(Math.random() * 10000)}`,
      name: `${baseName} ${dateLabel}`,
      savedAt,
      settings: { ...settings },
      gridSnapshot: cloneGrid(activeGrid),
      previewBackground,
      prompt,
      motifStyle,
      motifVariant,
      sourcePreviewUrl: storedSourcePreviewUrl,
      sourceSvg,
      sourceLabel,
      imageName,
      manualPixels: { ...manualPixels },
      blankMode,
      showRaster,
      thumbnailUrl: svgToDataUrl(generateSvg(activeGrid, settings)),
    }

    setSavedMarks((current) => [nextMark, ...current].slice(0, MAX_FAVORITES))
    setStatus('Favorit gespeichert.')
  }

  const restoreSavedMark = async (mark: SavedMark) => {
    pushUndoSnapshot('Favorit geladen')
    const restoredGrid = mark.gridSnapshot ? adaptGridToSettings(cloneGrid(mark.gridSnapshot), mark.settings) : null
    const restoredSourcePreview = mark.sourcePreviewUrl || (mark.sourceSvg ? svgToDataUrl(mark.sourceSvg) : '')
    const restoredManualPixels = mark.manualPixels ?? {}

    setSettings(mark.settings)
    setPreviewBackground(mark.previewBackground)
    setPrompt(mark.prompt)
    setMotifStyle(mark.motifStyle)
    motifStyleRef.current = mark.motifStyle
    setMotifVariant(mark.motifVariant)
    setSourcePreviewUrl(restoredSourcePreview)
    setSourceSvg(mark.sourceSvg)
    setSourceLabel(mark.sourceLabel)
    setImageName(mark.imageName)
    setManualPixels(restoredManualPixels)
    setBlankMode(mark.blankMode || (!restoredSourcePreview && Object.keys(restoredManualPixels).length > 0 && !restoredGrid))
    setDrawMode(false)
    setShowRaster(mark.showRaster)
    setLineStart(null)
    setIsDrawing(false)

    if (restoredGrid) {
      setImage(null)
      setGrid(restoredGrid)
      setMotionPlayKey((current) => current + 1)
      setStatus(`${mark.name} geladen.`)
      return
    }

    if (!restoredSourcePreview) {
      setImage(null)
      setGrid(null)
      setMotionPlayKey((current) => current + 1)
      setStatus(`${mark.name} geladen.`)
      return
    }

    try {
      const nextImage = await createImageFromDataUrl(restoredSourcePreview)
      setImage(nextImage)
      setGrid(null)
      setMotionPlayKey((current) => current + 1)
      setStatus(`${mark.name} geladen.`)
    } catch {
      setImage(null)
      setGrid(null)
      setStatus('Favorit geladen, aber die Bildquelle konnte nicht wiederhergestellt werden.')
    }
  }

  const deleteSavedMark = (markId: string) => {
    setSavedMarks((current) => current.filter((mark) => mark.id !== markId))
    setStatus('Favorit gelöscht.')
  }

  useEffect(() => {
    if (hasArtwork) {
      setMotionPlayKey((current) => current + 1)
    }
  }, [hasArtwork, activeGrid?.elements.length])

  const handleExportPng = async () => {
    if (!activeGrid || !activeGrid.elements.length) {
      setStatus('Erzeuge oder zeichne zuerst ein Motiv.')
      return
    }

    try {
      await downloadPng(activeGrid, settings)
      setStatus('PNG heruntergeladen.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'PNG-Export fehlgeschlagen.')
    }
  }

  const handleExportSvg = () => {
    if (!activeGrid || !activeGrid.elements.length) {
      setStatus('Erzeuge oder zeichne zuerst ein Motiv.')
      return
    }

    downloadSvg(activeGrid, settings)
    setStatus('SVG heruntergeladen.')
  }

  const handleExportHtml = () => {
    if (!activeGrid || !activeGrid.elements.length) {
      setStatus('Erzeuge oder zeichne zuerst ein Motiv.')
      return
    }

    downloadHtml(activeGrid, settings)
    setStatus('HTML heruntergeladen.')
  }

  const handleExportBrandKit = () => {
    if (!activeGrid || !activeGrid.elements.length) {
      setStatus('Erzeuge oder zeichne zuerst ein Motiv.')
      return
    }

    downloadBrandKitHtml(activeGrid, settings, {
      prompt,
      sourceLabel,
      imageName,
      generatedAt: new Intl.DateTimeFormat('de-DE', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date()),
    })
    setStatus('Brand Kit heruntergeladen.')
  }

  const handleExportAnimatedHtml = () => {
    if (!activeGrid || !activeGrid.elements.length) {
      setStatus('Erzeuge oder zeichne zuerst ein Motiv.')
      return
    }

    downloadAnimatedHtml(activeGrid, settings)
    setStatus('Animations-HTML heruntergeladen.')
  }

  const handleExportMotionSequence = () => {
    if (!activeGrid || !activeGrid.elements.length) {
      setStatus('Erzeuge oder zeichne zuerst ein Motiv.')
      return
    }

    downloadMotionSequenceHtml(activeGrid, settings, {
      prompt: motionPrompt,
      sourceLabel,
    })
    setStatus('Motion-Sequenz mit drei Frames heruntergeladen.')
  }

  const handleCopyMotionPrompt = async () => {
    if (!activeGrid || !activeGrid.elements.length) {
      setStatus('Erzeuge oder zeichne zuerst ein Motiv.')
      return
    }

    try {
      await navigator.clipboard.writeText(generateMotionSequencePrompt({ prompt: motionPrompt, sourceLabel }))
      setStatus('Motion-Brief in die Zwischenablage kopiert.')
    } catch {
      setStatus('Keine Berechtigung zum Schreiben in die Zwischenablage.')
    }
  }

  const handleExportVideo = async () => {
    if (!activeGrid || !activeGrid.elements.length) {
      setStatus('Erzeuge oder zeichne zuerst ein Motiv.')
      return
    }

    try {
      setIsExportingVideo(true)
      setStatus('Smart-Motion Video wird gerendert...')
      await downloadSmartMotionVideo(activeGrid, settings)
      setStatus('Smart-Motion Video heruntergeladen.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Video-Export fehlgeschlagen.')
    } finally {
      setIsExportingVideo(false)
    }
  }

  const replayMotionPreview = () => {
    if (!hasArtwork) {
      setStatus('Erzeuge oder zeichne zuerst ein Motiv.')
      return
    }

    setMotionPlayKey((current) => current + 1)
    setStatus('Smart Motion wird in der App abgespielt.')
  }

  const handleCopySvg = async () => {
    if (!activeGrid || !activeGrid.elements.length) {
      setStatus('Erzeuge oder zeichne zuerst ein Motiv.')
      return
    }

    try {
      await navigator.clipboard.writeText(generateSvg(activeGrid, settings))
      setStatus('SVG in die Zwischenablage kopiert.')
    } catch {
      setStatus('Keine Berechtigung zum Schreiben in die Zwischenablage.')
    }
  }

  const handleDownloadSourceSvg = () => {
    if (!sourceSvg) {
      setStatus('Erzeuge erst ein Prompt-Motiv, um die Quell-SVG zu laden.')
      return
    }

    downloadTextFile(sourceSvg, 'veyra-source-motif.svg', 'image/svg+xml;charset=utf-8')
    setStatus('Quell-SVG heruntergeladen.')
  }

  const handleBlankCanvas = () => {
    pushUndoSnapshot('Leeres Raster')
    setImage(null)
    setGrid(null)
    setBlankMode(true)
    setDrawMode(true)
    setManualPixels({})
    setSourcePreviewUrl('')
    setSourceSvg('')
    setImageName('Leeres Zeichenraster')
    setSourceLabel('Manuelles Pixelraster')
    setStatus('Leeres Raster bereit. Zeichne Pixel oder Linien direkt auf der Fläche.')
  }

  const handleClearManualPixels = () => {
    pushUndoSnapshot('Pixel gelöscht')
    setManualPixels({})
    setLineStart(null)
    setStatus('Manuelle Pixel gelöscht.')
  }

  const toggleDrawMode = (enabled: boolean) => {
    pushUndoSnapshot(enabled ? 'Zeichnen aktiviert' : 'Zeichnen deaktiviert')
    setDrawMode(enabled)
    setShowRaster((current) => current || enabled)
    setStatus(
      enabled
        ? 'Zeichenmodus aktiv. Wähle ein Werkzeug und male direkt im Raster.'
        : 'Zeichenmodus pausiert. Das Motiv bleibt erhalten.',
    )
  }

  const updatePreviewBackground = (background: PreviewBackground) => {
    if (previewBackground !== background) {
      pushUndoSnapshot('Vorschau-Hintergrund')
      setPreviewBackground(background)
    }
  }

  const applyPreset = (presetSettings: Partial<GeneratorSettings>) => {
    pushUndoSnapshot('Look-Preset')
    setSettings((current) => ({
      ...current,
      ...presetSettings,
    }))
  }

  const buildLogoSettings = (recipe: LogoBrief, randomize = false): Partial<GeneratorSettings> => {
    const randomBoost = randomize ? Math.random() : 0
    const baseSettings = recipe.settings ?? LOGO_RECIPES.find((candidate) => candidate.style === recipe.style)?.settings ?? {}

    return {
      ...baseSettings,
      gridSize: Math.round(
        clampNumber((baseSettings.gridSize ?? settings.gridSize) + (randomize ? (randomBoost - 0.5) * 16 : 0), 24, 72),
      ),
      elementSize: Math.round(
        clampNumber((baseSettings.elementSize ?? settings.elementSize) + (randomize ? (Math.random() - 0.5) * 18 : 0), 56, 98),
      ),
      smallSquareRatio: Math.round(
        clampNumber((baseSettings.smallSquareRatio ?? settings.smallSquareRatio) + (randomize ? (Math.random() - 0.5) * 26 : 0), 12, 62),
      ),
      threshold: Math.round(
        clampNumber((baseSettings.threshold ?? settings.threshold) + (randomize ? (Math.random() - 0.5) * 14 : 0), 24, 58),
      ),
      contrast: Math.round(
        clampNumber((baseSettings.contrast ?? settings.contrast) + (randomize ? (Math.random() - 0.5) * 48 : 0), 96, 196),
      ),
      pixelSmoothing: Math.round(
        clampNumber((baseSettings.pixelSmoothing ?? settings.pixelSmoothing) + (randomize ? (Math.random() - 0.5) * 32 : 0), 24, 78),
      ),
    }
  }

  const createLogoVariant = (recipe: LogoBrief, variant: number, randomize = true): LogoVariant => {
    const svg = createLocalPromptSvg(recipe.prompt, { style: recipe.style, variant })

    return {
      ...recipe,
      id: `${slugify(recipe.name)}-${variant}`,
      settings: buildLogoSettings(recipe, randomize),
      svg,
      previewUrl: svgToDataUrl(svg),
      variant,
    }
  }

  const applyLogoVariant = async (logoVariant: LogoVariant) => {
    pushUndoSnapshot('Logo-Variante')
    setSettings((current) => ({
      ...current,
      ...logoVariant.settings,
    }))
    setPrompt(logoVariant.prompt)
    setMotifVariant(logoVariant.variant)
    updateMotifStyle(logoVariant.style)
    setStatus(`${logoVariant.name} wird geladen...`)
    await loadSvgSource(logoVariant.svg, `${slugify(logoVariant.name)}-source.svg`, `${logoVariant.name} Vorlage`, { skipUndo: true })
    setMotionPlayKey((current) => current + 1)
    setStatus(`${logoVariant.name} aktiv. Smart Motion ansehen oder weiter bearbeiten.`)
  }

  const applyLogoRecipe = async (
    recipe: LogoRecipe,
    options: { randomize?: boolean; variant?: number } = {},
  ) => {
    pushUndoSnapshot('Logo-Vorlage')
    const nextVariant = options.variant ?? motifVariant + 1
    const logoVariant = createLogoVariant(recipe, nextVariant, options.randomize)

    setSettings((current) => ({
      ...current,
      ...logoVariant.settings,
    }))
    setPrompt(recipe.prompt)
    setMotifVariant(nextVariant)
    updateMotifStyle(recipe.style)
    setStatus(`${recipe.name} wird als Logo-Vorlage erzeugt...`)

    await loadSvgSource(
      logoVariant.svg,
      `${slugify(recipe.name)}-source.svg`,
      `${recipe.name} Vorlage`,
      { skipUndo: true },
    )
    setLogoVariants((current) => [logoVariant, ...current.filter((variant) => variant.id !== logoVariant.id)].slice(0, 16))
    setMotionPlayKey((current) => current + 1)
    setStatus(`${recipe.name} erzeugt. Feinjustieren, zeichnen oder Smart Motion ansehen.`)
  }

  const generateRandomLogoRecipe = () => {
    const nextCursor = logoRecipeCursor + 1
    const recipe = LOGO_RECIPES[Math.floor(Math.random() * LOGO_RECIPES.length)]
    setLogoRecipeCursor(nextCursor)
    void applyLogoRecipe(recipe, { randomize: true, variant: nextCursor + Math.floor(Math.random() * 1000) })
  }

  const getSketchSummary = () => {
    if (!activeGrid || !activeGrid.elements.length) {
      return 'Keine Skizze aktiv. Arbeite aus Prompt und Veyra/Festag Markenrichtung.'
    }

    const rows = activeGrid.elements.map((element) => element.row)
    const columns = activeGrid.elements.map((element) => element.column)
    const primary = activeGrid.elements.filter((element) => element.tone === 'primary').length
    const secondary = activeGrid.elements.length - primary
    const density = Math.round((activeGrid.elements.length / (activeGrid.gridSize * activeGrid.gridSize)) * 100)

    return [
      `${activeGrid.elements.length} Pixel auf ${activeGrid.gridSize}er Raster`,
      `${density}% Dichte`,
      `Bounds Zeilen ${Math.min(...rows)}-${Math.max(...rows)}, Spalten ${Math.min(...columns)}-${Math.max(...columns)}`,
      `${primary} hell, ${secondary} gedämpft`,
      `${manualPixelCount} manuelle Pixel`,
      sourceLabel,
    ].join('; ')
  }

  const getFallbackLogoBriefs = (count: number, sketchSummary: string): LogoBrief[] =>
    Array.from({ length: count }, (_, index) => {
      const recipe = LOGO_RECIPES[(logoRecipeCursor + index) % LOGO_RECIPES.length]
      const direction = ['Core', 'Seal', 'Arc', 'Signal', 'Gate', 'Node', 'Crest', 'Orbit'][index % 8]

      return {
        ...recipe,
        name: `${recipe.name} ${direction}`,
        prompt: `${prompt}. ${recipe.prompt}. Aus Skizze ableiten: ${sketchSummary}. Richtung ${index + 1}.`,
      }
    })

  const requestClaudeLogoBriefs = async (sketchSummary: string) => {
    const response = await fetch('/api/generate-logo-briefs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt,
        style: motifStyle,
        sketchSummary,
        count: 16,
      }),
    })

    if (!response.ok) {
      return null
    }

    const data = (await response.json()) as { briefs?: LogoBrief[]; source?: string }

    if (!Array.isArray(data.briefs) || !data.briefs.length) {
      return null
    }

    return {
      briefs: data.briefs
        .filter((brief) => brief.name && brief.prompt && brief.style)
        .map((brief, index) => ({
          ...brief,
          settings: LOGO_RECIPES[index % LOGO_RECIPES.length].settings,
        }))
        .slice(0, 16),
      source: data.source,
    }
  }

  const generateLogoSeries = async () => {
    const nextCursor = logoRecipeCursor + 16
    const sketchSummary = getSketchSummary()

    setLogoRecipeCursor(nextCursor)
    setIsGeneratingLogoLab(true)
    setStatus('Logo Lab erstellt 16 Alternativen aus Prompt und Skizze...')

    try {
      const claudeResult = await requestClaudeLogoBriefs(sketchSummary)
      const briefs = claudeResult?.briefs.length ? claudeResult.briefs : getFallbackLogoBriefs(16, sketchSummary)
      const variants = briefs.slice(0, 16).map((brief, index) =>
        createLogoVariant(brief, nextCursor + index + Math.floor(Math.random() * 900), true),
      )

      setLogoVariants(variants)
      setStatus(
        claudeResult?.source === 'claude'
          ? 'Claude hat 16 Logo-Richtungen vorgeschlagen. Wähle eine aus.'
          : '16 Logo-Alternativen lokal erzeugt. Wähle eine aus.',
      )
    } catch {
      const variants = getFallbackLogoBriefs(16, sketchSummary).map((brief, index) =>
        createLogoVariant(brief, nextCursor + index + Math.floor(Math.random() * 900), true),
      )

      setLogoVariants(variants)
      setStatus('16 Logo-Alternativen lokal erzeugt. Claude ist optional.')
    } finally {
      setIsGeneratingLogoLab(false)
    }
  }

  const randomizeSettings = () => {
    const shapes: ShapeMode[] = ['square', 'circle', 'rounded-square']
    pushUndoSnapshot('Fein zufällig')
    setSettings((current) => ({
      ...current,
      gridSize: Math.round(30 + Math.random() * 30),
      elementSize: Math.round(70 + Math.random() * 24),
      smallSquareRatio: Math.round(18 + Math.random() * 34),
      threshold: Math.round(32 + Math.random() * 20),
      contrast: Math.round(108 + Math.random() * 58),
      pixelSmoothing: Math.round(32 + Math.random() * 36),
      shape: shapes[Math.floor(Math.random() * shapes.length)],
    }))
  }

  return (
    <main
      className={`app-shell ${isDragging ? 'is-dragging' : ''}`}
      onDragEnter={handleDragEnter}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{ '--accent-color': settings.accentColor } as CSSProperties}
    >
      <input
        id={IMAGE_INPUT_ID}
        ref={fileInputRef}
        className="file-input"
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        onChange={handleFileInput}
      />
      <input
        id={TEXT_FONT_INPUT_ID}
        ref={textFontInputRef}
        className="file-input"
        type="file"
        accept=".ttf,.otf,font/ttf,font/otf"
        onChange={handleTextFontInput}
      />

      <header className="topbar">
        <div className="brand">
          <img className="brand-mark" src="/favicon.svg" alt="" aria-hidden="true" />
          <div>
            <h1>Veyra Pixel Generator</h1>
            <p>{sourceMeta}</p>
          </div>
        </div>

        <div className="toolbar" aria-label="Generator-Aktionen">
          <button className="button button-undo" type="button" disabled={!canUndo} onClick={handleUndo}>
            Zurück
          </button>
          <button className="button" type="button" disabled={!hasArtwork} onClick={saveCurrentMark}>
            Merken
          </button>
          <label className="button button-primary upload-label" htmlFor={IMAGE_INPUT_ID}>
            Bild laden
          </label>
          <button className="button" type="button" onClick={pasteFromClipboard}>
            Einfügen
          </button>
          <button className={`button ${drawMode ? 'is-active-button' : ''}`} type="button" onClick={() => toggleDrawMode(!drawMode)}>
            {drawMode ? 'Zeichnen: An' : 'Zeichnen: Aus'}
          </button>
          <div className="segmented" aria-label="Tonmodus">
            <button
              type="button"
              className={settings.tones === 'one' ? 'is-active' : ''}
              onClick={() => updateSetting('tones', 'one')}
            >
              1 Ton
            </button>
            <button
              type="button"
              className={settings.tones === 'two' ? 'is-active' : ''}
              onClick={() => updateSetting('tones', 'two')}
            >
              2 Töne
            </button>
          </div>
          <button className="button" type="button" disabled={!hasArtwork} onClick={handleExportPng}>
            PNG Export
          </button>
          <button className="button" type="button" disabled={!hasArtwork} onClick={handleExportSvg}>
            SVG Export
          </button>
          <button className="button" type="button" disabled={!hasArtwork} onClick={handleExportBrandKit}>
            Brand Kit
          </button>
          <button className="button button-motion" type="button" disabled={!hasArtwork} onClick={handleExportAnimatedHtml}>
            Smart Motion
          </button>
          <button className="button" type="button" disabled={!hasArtwork} onClick={handleExportMotionSequence}>
            Motion Sequenz
          </button>
        </div>
      </header>

      <section className="workspace">
        <section className="preview-column" aria-label="Vorschau des generierten Zeichens">
          <section className="prompt-panel" aria-label="KI-Motivgenerator">
            <div className="prompt-copy">
              <h2>KI-Motiv</h2>
              <p>Beschreibe ein Symbol. Claude kann die Quelle erzeugen; der lokale Generator funktioniert sofort.</p>
            </div>
            <div className="prompt-stack">
              <div className="prompt-input-row">
                <textarea
                  value={prompt}
                  rows={2}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="z. B. abstrakter Veyra-Kompass, modulares Festivalzeichen, ruhiges Monogramm"
                />
                <button
                  className="button button-primary prompt-button"
                  type="button"
                  onClick={() => void generatePromptMotif()}
                  disabled={isGeneratingPrompt}
                >
                  {isGeneratingPrompt ? 'Wird erzeugt...' : 'Pixelmark erzeugen'}
                </button>
              </div>
              <div className="prompt-tools">
                <div className="segmented prompt-style-control" aria-label="Motivstil">
                  {MOTIF_STYLES.map((style) => (
                    <button
                      key={style.value}
                      type="button"
                      className={motifStyle === style.value ? 'is-active' : ''}
                      onClick={() => updateMotifStyle(style.value)}
                    >
                      {style.label}
                    </button>
                  ))}
                </div>
                <button className="button" type="button" onClick={generateNextVariant} disabled={isGeneratingPrompt || !prompt.trim()}>
                  Neue Variante
                </button>
                <button
                  className="button button-motion"
                  type="button"
                  disabled={isGeneratingLogoLab}
                  onClick={() => void generateLogoSeries()}
                >
                  {isGeneratingLogoLab ? 'Denkt...' : '16 Alternativen'}
                </button>
              </div>
            </div>
          </section>

          <div className={`preview-frame preview-${previewBackground} ${drawMode ? 'is-draw-mode' : ''}`} onDoubleClick={openFilePicker}>
            <div className="preview-mode-strip">
              <button
                className={`draw-switch-button ${drawMode ? 'is-on' : ''}`}
                type="button"
                onClick={() => toggleDrawMode(!drawMode)}
                aria-pressed={drawMode}
              >
                <span className="switch-dot" aria-hidden="true" />
                {drawMode ? 'Zeichnen an' : 'Zeichnen aus'}
              </button>
              <button className="motion-mini-button" type="button" disabled={!hasArtwork} onClick={replayMotionPreview}>
                Smart Motion ansehen
              </button>
            </div>
            <canvas
              ref={previewCanvasRef}
              className={`preview-canvas ${drawMode ? 'is-drawable' : ''}`}
              aria-label="Vorschau und Pixel-Zeichenfläche"
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
              onPointerCancel={handleCanvasPointerUp}
              onPointerLeave={handleCanvasPointerLeave}
            />

            {!activeGrid && (
              <div className="empty-state">
                <div className="empty-card">
                  <p className="empty-kicker">{isDragging ? 'Loslassen zum Laden' : 'Bildeingabe'}</p>
                  <strong>{isLoadingImage ? 'Bild wird geladen...' : 'Bild hier ablegen'}</strong>
                  <span>PNG, JPG, WEBP oder SVG bleibt lokal in deinem Browser. Oder starte direkt mit einem leeren Raster.</span>
                  <div className="empty-actions">
                    <label className="button button-primary upload-label" htmlFor={IMAGE_INPUT_ID}>
                      Bild wählen
                    </label>
                    <button className="button" type="button" onClick={pasteFromClipboard}>
                      Bild einfügen
                    </button>
                    <button className="button" type="button" onClick={loadSampleSource}>
                      Testquelle
                    </button>
                    <button className="button" type="button" onClick={handleBlankCanvas}>
                      Leeres Raster
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="preview-footer">
            <span>{imageName || 'Noch kein Bild gewählt'}</span>
            <span>{settings.outputSize}px Export</span>
          </div>
        </section>

        <aside className="controls-panel" aria-label="Generator-Steuerung">
          <div className="panel-header">
            <div>
              <h2>Steuerung</h2>
              <p>{status}</p>
            </div>
            <button
              className="button button-compact"
              type="button"
              onClick={() => {
                pushUndoSnapshot('Zurücksetzen')
                setSettings(DEFAULT_SETTINGS)
              }}
            >
              Zurücksetzen
            </button>
          </div>

          <section className="control-section">
            <h3>Quelle</h3>
            <div className="source-card">
              <div className="source-thumb">
                {sourcePreviewUrl ? <img src={sourcePreviewUrl} alt="" /> : <span>Keine Quelle</span>}
              </div>
              <div>
                <strong>{sourceLabel}</strong>
                <p>{imageName || 'Motiv erzeugen, Bild laden oder Raster zeichnen.'}</p>
              </div>
            </div>
            <div className="export-grid">
              <button className="button" type="button" onClick={loadSampleSource}>
                Testquelle
              </button>
              <button className="button" type="button" disabled={!sourceSvg} onClick={handleDownloadSourceSvg}>
                Quell-SVG
              </button>
            </div>
          </section>

          <section className="control-section">
            <h3>Text zu Pixel</h3>
            <div className="text-source-panel">
              <textarea
                value={textSourceValue}
                rows={3}
                onChange={(event) => setTextSourceValue(event.target.value)}
                placeholder="Text oder Wortmarke eingeben"
              />
              <div className="text-source-actions">
                <label className="button" htmlFor={TEXT_FONT_INPUT_ID}>
                  {isLoadingTextFont ? 'Lädt...' : 'TTF/OTF laden'}
                </label>
                <button className="button button-primary" type="button" onClick={() => void createTextPixelSource()}>
                  Text pixeln
                </button>
              </div>
              <p>{textFontLabel}</p>
            </div>
          </section>

          <section className="control-section motion-control-section">
            <div className="section-heading-row">
              <h3>Smart Motion</h3>
              <button className="button button-compact" type="button" disabled={!hasArtwork} onClick={replayMotionPreview}>
                Replay
              </button>
            </div>
            <MotionPreview grid={activeGrid} settings={settings} playKey={motionPlayKey} />
            <div className="motion-brief-panel">
              <textarea
                value={motionPrompt}
                rows={3}
                onChange={(event) => setMotionPrompt(event.target.value)}
                placeholder="Beschreibe die Bewegung: ruhig verdichten, Rotation, finaler Hold..."
              />
              <div className="export-grid">
                <button className="button button-primary" type="button" disabled={!hasArtwork} onClick={handleExportMotionSequence}>
                  3 Frames exportieren
                </button>
                <button className="button" type="button" disabled={!hasArtwork} onClick={() => void handleCopyMotionPrompt()}>
                  Brief kopieren
                </button>
              </div>
            </div>
            <div className="export-grid">
              <button className="button button-motion" type="button" disabled={!hasArtwork} onClick={handleExportAnimatedHtml}>
                Motion HTML
              </button>
              <button className="button" type="button" disabled={!hasArtwork || isExportingVideo} onClick={() => void handleExportVideo()}>
                {isExportingVideo ? 'Rendert...' : 'WebM roh'}
              </button>
            </div>
          </section>

          <section className="control-section">
            <div className="section-heading-row">
              <h3>Favoriten</h3>
              <button className="button button-compact" type="button" disabled={!hasArtwork} onClick={saveCurrentMark}>
                Merken
              </button>
            </div>
            {savedMarks.length > 0 ? (
              <div className="favorite-grid" aria-label="Gespeicherte Favoriten">
                {savedMarks.map((mark) => (
                  <article className="favorite-card" key={mark.id}>
                    <button className="favorite-preview" type="button" onClick={() => void restoreSavedMark(mark)}>
                      <img src={mark.thumbnailUrl} alt="" />
                      <span>{mark.name}</span>
                    </button>
                    <div className="favorite-actions">
                      <button className="button button-compact" type="button" onClick={() => void restoreSavedMark(mark)}>
                        Laden
                      </button>
                      <button className="button button-compact" type="button" onClick={() => deleteSavedMark(mark.id)}>
                        Löschen
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="draw-hint">Speichere starke Varianten mit Merken. Sie bleiben in diesem Browser erhalten.</p>
            )}
          </section>

          <section className="control-section">
            <h3>Pixel zeichnen</h3>
            <label className="draw-toggle-card">
              <span>
                <strong>{drawMode ? 'Zeichnen ist aktiv' : 'Zeichnen ist aus'}</strong>
                <small>{drawMode ? 'Canvas nimmt Mausklicks als Pixel auf.' : 'Canvas ist nur Vorschau und Exportfläche.'}</small>
              </span>
              <input className="toggle-input" type="checkbox" checked={drawMode} onChange={(event) => toggleDrawMode(event.target.checked)} />
              <span className="switch-track" aria-hidden="true" />
            </label>
            <div className="draw-tools" aria-label="Zeichenwerkzeuge">
              {DRAW_TOOLS.map((tool) => (
                <button
                  className={`draw-tool ${drawTool === tool.value ? 'is-active' : ''}`}
                  type="button"
                  key={tool.value}
                  onClick={() => {
                    setDrawTool(tool.value)
                    setDrawMode(true)
                    setStatus(tool.value === 'line' ? 'Linienwerkzeug aktiv. Start und Ziel im Raster wählen.' : `${tool.label} aktiv.`)
                  }}
                >
                  <strong>{tool.label}</strong>
                  <span>{tool.description}</span>
                </button>
              ))}
            </div>
            <SliderControl label="Pinselgröße" min={1} max={4} value={brushSize} onChange={setBrushSize} />
            <label className="toggle-control">
              <span>Raster anzeigen</span>
              <input className="toggle-input" type="checkbox" checked={showRaster} onChange={(event) => setShowRaster(event.target.checked)} />
              <span className="switch-track" aria-hidden="true" />
            </label>
            <div className="export-grid">
              <button className="button" type="button" onClick={handleBlankCanvas}>
                Leeres Raster
              </button>
              <button className="button" type="button" disabled={!manualPixelCount} onClick={handleClearManualPixels}>
                Pixel löschen
              </button>
            </div>
            <p className="draw-hint">
              {manualPixelCount} manuelle Pixel. Schwelle reduziert Zeichnungen mit, Schatten verschwinden früher.
            </p>
          </section>

          <section className="control-section">
            <div className="section-heading-row">
              <h3>Logo-Vorlagen</h3>
              <button className="button button-compact" type="button" onClick={generateRandomLogoRecipe}>
                1000 Mix
              </button>
            </div>
            <div className="logo-recipe-grid">
              {LOGO_RECIPES.map((recipe) => (
                <button className="logo-recipe-button" type="button" key={recipe.name} onClick={() => void applyLogoRecipe(recipe)}>
                  {recipe.name}
                </button>
              ))}
            </div>
            <button className="button button-primary full-width" type="button" onClick={generateRandomLogoRecipe}>
              Logo random generieren
            </button>
            <button
              className="button button-motion full-width"
              type="button"
              disabled={isGeneratingLogoLab}
              onClick={() => void generateLogoSeries()}
            >
              {isGeneratingLogoLab ? 'Logo Lab denkt...' : '16 Logo-Alternativen'}
            </button>
            {logoVariants.length > 0 && (
              <div className="logo-variant-grid" aria-label="Logo-Varianten">
                {logoVariants.map((logoVariant) => (
                  <button
                    className="logo-variant-card"
                    type="button"
                    key={logoVariant.id}
                    onClick={() => void applyLogoVariant(logoVariant)}
                  >
                    <img src={logoVariant.previewUrl} alt="" />
                    <span>{logoVariant.name}</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="control-section">
            <h3>Look-Presets</h3>
            <div className="preset-grid">
              {PRESETS.map((preset) => (
                <button className="preset-button" type="button" key={preset.name} onClick={() => applyPreset(preset.settings)}>
                  {preset.name}
                </button>
              ))}
            </div>
            <button className="button full-width" type="button" onClick={randomizeSettings}>
              Fein zufällig abstimmen
            </button>
          </section>

          <section className="control-section">
            <h3>Raster</h3>
            <SliderControl label="Rastergröße" min={12} max={80} value={settings.gridSize} onChange={(value) => updateSetting('gridSize', value)} />
            <SliderControl
              label="Elementgröße"
              min={20}
              max={100}
              value={settings.elementSize}
              suffix="%"
              onChange={(value) => updateSetting('elementSize', value)}
            />
            <SliderControl
              label="Kleine-Pixel-Verhältnis"
              min={8}
              max={80}
              value={settings.smallSquareRatio}
              suffix="%"
              onChange={(value) => updateSetting('smallSquareRatio', value)}
            />
            <SliderControl
              label="Schwelle"
              min={8}
              max={82}
              value={settings.threshold}
              suffix="%"
              onChange={(value) => updateSetting('threshold', value)}
            />
            <SliderControl
              label="Kontrast"
              min={50}
              max={220}
              value={settings.contrast}
              suffix="%"
              onChange={(value) => updateSetting('contrast', value)}
            />
            <SliderControl
              label="Pixelruhe"
              min={0}
              max={100}
              value={settings.pixelSmoothing}
              suffix="%"
              onChange={(value) => updateSetting('pixelSmoothing', value)}
            />
          </section>

          <section className="control-section">
            <h3>Form</h3>
            <div className="segmented segmented-wide" aria-label="Formmodus">
              <button
                type="button"
                className={settings.shape === 'square' ? 'is-active' : ''}
                onClick={() => updateSetting('shape', 'square')}
              >
                Quadrat
              </button>
              <button
                type="button"
                className={settings.shape === 'circle' ? 'is-active' : ''}
                onClick={() => updateSetting('shape', 'circle')}
              >
                Kreis
              </button>
              <button
                type="button"
                className={settings.shape === 'rounded-square' ? 'is-active' : ''}
                onClick={() => updateSetting('shape', 'rounded-square')}
              >
                Gerundet
              </button>
            </div>
            <label className="toggle-control">
              <span>Sampling invertieren</span>
              <input
                className="toggle-input"
                type="checkbox"
                checked={settings.invert}
                onChange={(event) => updateSetting('invert', event.target.checked)}
              />
              <span className="switch-track" aria-hidden="true" />
            </label>
          </section>

          <section className="control-section">
            <h3>Farbe</h3>
            <ColorControl label="Hintergrund" value={settings.bgColor} onChange={(value) => updateSetting('bgColor', value)} />
            <ColorControl label="Primär" value={settings.primaryColor} onChange={(value) => updateSetting('primaryColor', value)} />
            <ColorControl label="Sekundär" value={settings.secondaryColor} onChange={(value) => updateSetting('secondaryColor', value)} />
            <ColorControl label="Akzent" value={settings.accentColor} onChange={(value) => updateSetting('accentColor', value)} />
            <label className="toggle-control">
              <span>Transparenter Export-Hintergrund</span>
              <input
                className="toggle-input"
                type="checkbox"
                checked={settings.transparentBg}
                onChange={(event) => updateSetting('transparentBg', event.target.checked)}
              />
              <span className="switch-track" aria-hidden="true" />
            </label>
          </section>

          <section className="control-section">
            <h3>Vorschau</h3>
            <div className="segmented segmented-wide" aria-label="Vorschau-Hintergrund">
              <button
                type="button"
                className={previewBackground === 'dark' ? 'is-active' : ''}
                onClick={() => updatePreviewBackground('dark')}
              >
                Dunkel
              </button>
              <button
                type="button"
                className={previewBackground === 'light' ? 'is-active' : ''}
                onClick={() => updatePreviewBackground('light')}
              >
                Hell
              </button>
              <button
                type="button"
                className={previewBackground === 'transparent' ? 'is-active' : ''}
                onClick={() => updatePreviewBackground('transparent')}
              >
                Transparent
              </button>
            </div>
            <SliderControl
              label="Exportgröße"
              min={640}
              max={2000}
              step={40}
              value={settings.outputSize}
              suffix="px"
              onChange={(value) => updateSetting('outputSize', value)}
            />
            <SliderControl
              label="Rand"
              min={0}
              max={360}
              step={4}
              value={settings.padding}
              suffix="px"
              onChange={(value) => updateSetting('padding', value)}
            />
          </section>

          <section className="control-section">
            <h3>Export</h3>
            <div className="export-grid">
              <button className="button" type="button" disabled={!hasArtwork} onClick={handleExportPng}>
                PNG
              </button>
              <button className="button" type="button" disabled={!hasArtwork} onClick={handleExportSvg}>
                SVG
              </button>
              <button className="button" type="button" disabled={!hasArtwork} onClick={handleCopySvg}>
                SVG kopieren
              </button>
              <button className="button" type="button" disabled={!hasArtwork} onClick={handleExportHtml}>
                HTML
              </button>
              <button className="button" type="button" disabled={!hasArtwork} onClick={handleExportBrandKit}>
                Brand Kit
              </button>
              <button className="button" type="button" disabled={!hasArtwork} onClick={handleExportMotionSequence}>
                Motion Sequenz
              </button>
              <button className="button" type="button" disabled={!hasArtwork || isExportingVideo} onClick={() => void handleExportVideo()}>
                {isExportingVideo ? 'Video...' : 'WebM roh'}
              </button>
              <button className="button full-width-button" type="button" disabled={!hasArtwork} onClick={handleExportAnimatedHtml}>
                Smart-Motion HTML
              </button>
            </div>
          </section>
        </aside>
      </section>

      <canvas ref={processingCanvasRef} className="processing-canvas" aria-hidden="true" />
    </main>
  )
}

export default App
