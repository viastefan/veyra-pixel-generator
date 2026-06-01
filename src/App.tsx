import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ChangeEvent, DragEvent } from 'react'
import type { GeneratorSettings, GeneratedGrid, PreviewBackground, ShapeMode } from './types'
import {
  DEFAULT_SETTINGS,
  computePixelGrid,
  drawEmptyPreview,
  drawPixelMark,
  resolvePreviewSettings,
} from './utils/imageProcessing'
import { downloadPng } from './utils/pngExport'
import { downloadSvg, generateSvg } from './utils/svgExport'

const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml']

const PRESETS: Array<{ name: string; settings: Partial<GeneratorSettings> }> = [
  {
    name: 'Veyra Dark',
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
    name: '1inch style',
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
    name: 'Soft nodes',
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
    name: 'Sharp pixel',
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

  return /\.(png|jpe?g|webp|svg)$/i.test(file.name)
}

function createImageFromFile(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }

    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('The selected image could not be loaded.'))
    }

    image.src = url
  })
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
  const [status, setStatus] = useState('Load, drop, or paste an image.')

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const processingCanvasRef = useRef<HTMLCanvasElement | null>(null)

  const updateSetting = useCallback(<Key extends keyof GeneratorSettings>(key: Key, value: GeneratorSettings[Key]) => {
    setSettings((current) => ({
      ...current,
      [key]: value,
    }))
  }, [])

  const loadImageFile = useCallback(async (file: File) => {
    if (!isSupportedImage(file)) {
      setStatus('Use PNG, JPG, JPEG, WEBP, or SVG.')
      return
    }

    try {
      const nextImage = await createImageFromFile(file)
      setImage(nextImage)
      setImageName(file.name || 'Clipboard image')
      setStatus('Image loaded. Adjust the mark or export it.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Image could not be loaded.')
    }
  }, [])

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]

    if (file) {
      void loadImageFile(file)
    }

    event.target.value = ''
  }

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    setIsDragging(false)

    const file = Array.from(event.dataTransfer.files).find((candidate) => candidate.type.startsWith('image/'))

    if (file) {
      void loadImageFile(file)
      return
    }

    setStatus('Drop an image file to generate a mark.')
  }

  const pasteFromClipboard = useCallback(async () => {
    if (!navigator.clipboard?.read) {
      setStatus('Clipboard image access is not available in this browser.')
      return
    }

    try {
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

      setStatus('Clipboard does not contain an image.')
    } catch {
      setStatus('Clipboard permission was not granted.')
    }
  }, [loadImageFile])

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
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
      setGrid(computePixelGrid(image, processingCanvasRef.current, settings))
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The mark could not be generated.')
    }
  }, [image, settings])

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

    if (!grid) {
      drawEmptyPreview(context, settings.outputSize, settings, previewBackground)
      return
    }

    drawPixelMark(context, grid, resolvePreviewSettings(settings, previewBackground))
  }, [grid, previewBackground, settings])

  const sourceMeta = useMemo(() => {
    if (!grid) {
      return 'No source loaded'
    }

    return `${grid.sourceWidth} x ${grid.sourceHeight} source, ${grid.elements.length} elements`
  }, [grid])

  const handleExportPng = () => {
    if (!grid) {
      setStatus('Load an image before exporting PNG.')
      return
    }

    downloadPng(grid, settings)
    setStatus('PNG export started.')
  }

  const handleExportSvg = () => {
    if (!grid) {
      setStatus('Load an image before exporting SVG.')
      return
    }

    downloadSvg(grid, settings)
    setStatus('SVG export started.')
  }

  const handleCopySvg = async () => {
    if (!grid) {
      setStatus('Load an image before copying SVG.')
      return
    }

    try {
      await navigator.clipboard.writeText(generateSvg(grid, settings))
      setStatus('SVG copied to clipboard.')
    } catch {
      setStatus('Clipboard write permission was not granted.')
    }
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
      onDragOver={(event) => {
        event.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      style={{ '--accent-color': settings.accentColor } as CSSProperties}
    >
      <input
        ref={fileInputRef}
        className="file-input"
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        onChange={handleFileInput}
      />

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <h1>Veyra Pixel Generator</h1>
            <p>{sourceMeta}</p>
          </div>
        </div>

        <div className="toolbar" aria-label="Generator actions">
          <button className="button button-primary" type="button" onClick={() => fileInputRef.current?.click()}>
            Load image
          </button>
          <button className="button" type="button" onClick={pasteFromClipboard}>
            Paste from clipboard
          </button>
          <div className="segmented" aria-label="Tone mode">
            <button
              type="button"
              className={settings.tones === 'one' ? 'is-active' : ''}
              onClick={() => updateSetting('tones', 'one')}
            >
              1 tone
            </button>
            <button
              type="button"
              className={settings.tones === 'two' ? 'is-active' : ''}
              onClick={() => updateSetting('tones', 'two')}
            >
              2 tones
            </button>
          </div>
          <button className="button" type="button" disabled={!grid} onClick={handleExportPng}>
            Export PNG
          </button>
          <button className="button" type="button" disabled={!grid} onClick={handleExportSvg}>
            Export SVG
          </button>
        </div>
      </header>

      <section className="workspace">
        <section className="preview-column" aria-label="Generated mark preview">
          <div className={`preview-frame preview-${previewBackground}`}>
            <canvas ref={previewCanvasRef} className="preview-canvas" aria-label="Generated pixel mark preview" />

            {!grid && (
              <div className="empty-state">
                <span>Drop or paste an image</span>
              </div>
            )}
          </div>

          <div className="preview-footer">
            <span>{imageName || 'No image selected'}</span>
            <span>{settings.outputSize}px export</span>
          </div>
        </section>

        <aside className="controls-panel" aria-label="Generator controls">
          <div className="panel-header">
            <div>
              <h2>Controls</h2>
              <p>{status}</p>
            </div>
            <button className="button button-compact" type="button" onClick={() => setSettings(DEFAULT_SETTINGS)}>
              Reset
            </button>
          </div>

          <section className="control-section">
            <h3>Presets</h3>
            <div className="preset-grid">
              {PRESETS.map((preset) => (
                <button className="preset-button" type="button" key={preset.name} onClick={() => applyPreset(preset.settings)}>
                  {preset.name}
                </button>
              ))}
            </div>
            <button className="button full-width" type="button" onClick={randomizeSettings}>
              Randomize subtle settings
            </button>
          </section>

          <section className="control-section">
            <h3>Grid</h3>
            <SliderControl label="Grid size" min={12} max={80} value={settings.gridSize} onChange={(value) => updateSetting('gridSize', value)} />
            <SliderControl
              label="Element size"
              min={20}
              max={100}
              value={settings.elementSize}
              suffix="%"
              onChange={(value) => updateSetting('elementSize', value)}
            />
            <SliderControl
              label="Small square ratio"
              min={8}
              max={80}
              value={settings.smallSquareRatio}
              suffix="%"
              onChange={(value) => updateSetting('smallSquareRatio', value)}
            />
            <SliderControl
              label="Threshold"
              min={8}
              max={82}
              value={settings.threshold}
              suffix="%"
              onChange={(value) => updateSetting('threshold', value)}
            />
            <SliderControl
              label="Contrast"
              min={50}
              max={220}
              value={settings.contrast}
              suffix="%"
              onChange={(value) => updateSetting('contrast', value)}
            />
          </section>

          <section className="control-section">
            <h3>Shape</h3>
            <div className="segmented segmented-wide" aria-label="Shape mode">
              <button
                type="button"
                className={settings.shape === 'square' ? 'is-active' : ''}
                onClick={() => updateSetting('shape', 'square')}
              >
                Square
              </button>
              <button
                type="button"
                className={settings.shape === 'circle' ? 'is-active' : ''}
                onClick={() => updateSetting('shape', 'circle')}
              >
                Circle
              </button>
              <button
                type="button"
                className={settings.shape === 'rounded-square' ? 'is-active' : ''}
                onClick={() => updateSetting('shape', 'rounded-square')}
              >
                Rounded
              </button>
            </div>
            <label className="toggle-control">
              <span>Invert sampling</span>
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
            <h3>Color</h3>
            <ColorControl label="Background" value={settings.bgColor} onChange={(value) => updateSetting('bgColor', value)} />
            <ColorControl label="Primary" value={settings.primaryColor} onChange={(value) => updateSetting('primaryColor', value)} />
            <ColorControl label="Secondary" value={settings.secondaryColor} onChange={(value) => updateSetting('secondaryColor', value)} />
            <ColorControl label="Accent" value={settings.accentColor} onChange={(value) => updateSetting('accentColor', value)} />
            <label className="toggle-control">
              <span>Transparent export background</span>
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
            <h3>Preview</h3>
            <div className="segmented segmented-wide" aria-label="Preview background">
              <button
                type="button"
                className={previewBackground === 'dark' ? 'is-active' : ''}
                onClick={() => setPreviewBackground('dark')}
              >
                Dark
              </button>
              <button
                type="button"
                className={previewBackground === 'light' ? 'is-active' : ''}
                onClick={() => setPreviewBackground('light')}
              >
                Light
              </button>
              <button
                type="button"
                className={previewBackground === 'transparent' ? 'is-active' : ''}
                onClick={() => setPreviewBackground('transparent')}
              >
                Clear
              </button>
            </div>
            <SliderControl
              label="Output size"
              min={640}
              max={2000}
              step={40}
              value={settings.outputSize}
              suffix="px"
              onChange={(value) => updateSetting('outputSize', value)}
            />
            <SliderControl
              label="Padding"
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
              <button className="button" type="button" disabled={!grid} onClick={handleExportPng}>
                PNG
              </button>
              <button className="button" type="button" disabled={!grid} onClick={handleExportSvg}>
                SVG
              </button>
              <button className="button" type="button" disabled={!grid} onClick={handleCopySvg}>
                Copy SVG
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
