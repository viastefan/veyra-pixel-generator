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
import { downloadAnimatedHtml, downloadHtml } from './utils/htmlExport'

const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml']
const IMAGE_INPUT_ID = 'veyra-image-input'
const ACCEPTED_IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|svg)$/i
type DrawTool = 'primary' | 'secondary' | 'erase' | 'line'
type ManualPixelValue = 'primary' | 'secondary' | 'erase'
type ManualPixelMap = Record<string, ManualPixelValue>
type GridCell = { row: number; column: number }

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

function isSupportedImage(file: File) {
  if (ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return true
  }

  return ACCEPTED_IMAGE_EXTENSIONS.test(file.name)
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

const clampNumber = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const cellKey = (cell: GridCell) => `${cell.row}-${cell.column}`

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
  const size = grid.cellSize * clampNumber(settings.elementSize / 100, 0.08, 1)
  const color = tone === 'primary' ? settings.primaryColor : settings.secondaryColor

  return {
    id: cellKey(cell),
    row: cell.row,
    column: cell.column,
    x: grid.padding + cell.column * grid.cellSize + grid.cellSize / 2,
    y: grid.padding + cell.row * grid.cellSize + grid.cellSize / 2,
    size,
    brightness: tone === 'primary' ? 0 : 0.36,
    strength: tone === 'primary' ? 1 : 0.62,
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
      editedElements.push(getManualElement(grid, settings, element, edit))
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

    editedElements.push(getManualElement(grid, settings, cell, edit))
  }

  return {
    ...grid,
    elements: editedElements,
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
  return (
    <label className="control">
      <span className="control-row">
        <span>{label}</span>
        <strong>
          {value}
          {suffix}
        </strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
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
  const [status, setStatus] = useState('Bild laden, einfügen oder direkt zeichnen.')

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const processingCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const dragDepthRef = useRef(0)
  const motifStyleRef = useRef<MotifStyle>('monogram')
  const lastPaintedKeyRef = useRef('')
  const lastPaintedCellRef = useRef<GridCell | null>(null)

  const updateSetting = useCallback(<Key extends keyof GeneratorSettings>(key: Key, value: GeneratorSettings[Key]) => {
    setSettings((current) => ({
      ...current,
      [key]: value,
    }))
  }, [])

  const loadImageFile = useCallback(async (file: File, options: { sourceSvg?: string; sourceLabel?: string } = {}) => {
    if (!isSupportedImage(file)) {
      setStatus('Nutze PNG, JPG, JPEG, WEBP oder SVG.')
      return
    }

    if (file.size === 0) {
      setStatus('Diese Bilddatei ist leer.')
      return
    }

    try {
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
  }, [])

  const loadSvgSource = useCallback(
    async (svg: string, fileName: string, sourceLabel = 'Erzeugte Quell-SVG') => {
      const file = new File([svg], fileName, { type: 'image/svg+xml' })
      await loadImageFile(file, { sourceSvg: svg, sourceLabel })
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
    if (!image || !processingCanvasRef.current) {
      setGrid(null)
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

    return applyManualPixels(baseGrid, manualPixels, settings)
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
      paintCells(getLineCells(lineStart, cell), 'primary')
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

  const handleExportAnimatedHtml = () => {
    if (!activeGrid || !activeGrid.elements.length) {
      setStatus('Erzeuge oder zeichne zuerst ein Motiv.')
      return
    }

    downloadAnimatedHtml(activeGrid, settings)
    setStatus('Animations-HTML heruntergeladen.')
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
    setManualPixels({})
    setLineStart(null)
    setStatus('Manuelle Pixel gelöscht.')
  }

  const toggleDrawMode = (enabled: boolean) => {
    setDrawMode(enabled)
    setShowRaster((current) => current || enabled)
    setStatus(
      enabled
        ? 'Zeichenmodus aktiv. Wähle ein Werkzeug und male direkt im Raster.'
        : 'Zeichenmodus pausiert. Das Motiv bleibt erhalten.',
    )
  }

  const applyPreset = (presetSettings: Partial<GeneratorSettings>) => {
    setSettings((current) => ({
      ...current,
      ...presetSettings,
    }))
  }

  const randomizeSettings = () => {
    const shapes: ShapeMode[] = ['square', 'circle', 'rounded-square']
    setSettings((current) => ({
      ...current,
      gridSize: Math.round(30 + Math.random() * 30),
      elementSize: Math.round(70 + Math.random() * 24),
      smallSquareRatio: Math.round(18 + Math.random() * 34),
      threshold: Math.round(32 + Math.random() * 20),
      contrast: Math.round(108 + Math.random() * 58),
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

      <header className="topbar">
        <div className="brand">
          <img className="brand-mark" src="/favicon.svg" alt="" aria-hidden="true" />
          <div>
            <h1>Veyra Pixel Generator</h1>
            <p>{sourceMeta}</p>
          </div>
        </div>

        <div className="toolbar" aria-label="Generator-Aktionen">
          <label className="button button-primary upload-label" htmlFor={IMAGE_INPUT_ID}>
            Bild laden
          </label>
          <button className="button" type="button" onClick={pasteFromClipboard}>
            Einfügen
          </button>
          <button className={`button ${drawMode ? 'is-active-button' : ''}`} type="button" onClick={() => toggleDrawMode(!drawMode)}>
            Pixel zeichnen
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
          <button className="button" type="button" disabled={!hasArtwork} onClick={handleExportAnimatedHtml}>
            Animation HTML
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
              </div>
            </div>
          </section>

          <div className={`preview-frame preview-${previewBackground} ${drawMode ? 'is-draw-mode' : ''}`} onDoubleClick={openFilePicker}>
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
            <button className="button button-compact" type="button" onClick={() => setSettings(DEFAULT_SETTINGS)}>
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
            <h3>Vorlagen</h3>
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
            <h3>Pixel zeichnen</h3>
            <label className="toggle-control">
              <span>Zeichenmodus</span>
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
              {manualPixelCount} manuelle Pixel. Mit ✏️ und 🌫️ zeichnest du frei, 📏 setzt gerade Pixellinien.
            </p>
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
                onClick={() => setPreviewBackground('dark')}
              >
                Dunkel
              </button>
              <button
                type="button"
                className={previewBackground === 'light' ? 'is-active' : ''}
                onClick={() => setPreviewBackground('light')}
              >
                Hell
              </button>
              <button
                type="button"
                className={previewBackground === 'transparent' ? 'is-active' : ''}
                onClick={() => setPreviewBackground('transparent')}
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
