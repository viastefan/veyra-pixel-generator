import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ChangeEvent, DragEvent } from 'react'
import type { GeneratorSettings, GeneratedGrid, MotifStyle, PreviewBackground, ShapeMode } from './types'
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
import { downloadHtml } from './utils/htmlExport'

const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml']
const IMAGE_INPUT_ID = 'veyra-image-input'
const ACCEPTED_IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|svg)$/i

const SAMPLE_SOURCE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="720" viewBox="0 0 720 720">
  <rect width="720" height="720" fill="#f6f8fb"/>
  <path d="M360 96 560 252v216L360 624 160 468V252L360 96Z" fill="#101821"/>
  <path d="M360 166 500 275v170L360 554 220 445V275L360 166Z" fill="#f6f8fb"/>
  <path d="M360 240 444 305v110L360 480 276 415V305L360 240Z" fill="#101821"/>
  <rect x="334" y="92" width="52" height="536" fill="#101821"/>
</svg>`

const MOTIF_STYLES: Array<{ value: MotifStyle; label: string }> = [
  { value: 'monogram', label: 'Monogram' },
  { value: 'emblem', label: 'Emblem' },
  { value: 'orbital', label: 'Orbital' },
  { value: 'signal', label: 'Signal' },
]

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
        reject(new Error('The image loaded, but it has no readable dimensions.'))
        return
      }

      resolve(image)
    }

    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('The selected image could not be loaded.'))
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
    reader.onerror = () => reject(new Error('The source preview could not be created.'))
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
  const [sourceLabel, setSourceLabel] = useState('No source loaded')
  const [status, setStatus] = useState('Load, drop, or paste an image.')

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const processingCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const dragDepthRef = useRef(0)

  const updateSetting = useCallback(<Key extends keyof GeneratorSettings>(key: Key, value: GeneratorSettings[Key]) => {
    setSettings((current) => ({
      ...current,
      [key]: value,
    }))
  }, [])

  const loadImageFile = useCallback(async (file: File, options: { sourceSvg?: string; sourceLabel?: string } = {}) => {
    if (!isSupportedImage(file)) {
      setStatus('Use PNG, JPG, JPEG, WEBP, or SVG.')
      return
    }

    if (file.size === 0) {
      setStatus('That image file is empty.')
      return
    }

    try {
      setIsLoadingImage(true)
      setStatus(`Loading ${file.name || 'image'}...`)
      const nextImage = await createImageFromBlob(file)
      const previewUrl = await readBlobAsDataUrl(file)
      setImage(nextImage)
      setImageName(file.name || 'Clipboard image')
      setSourcePreviewUrl(previewUrl)
      setSourceSvg(options.sourceSvg ?? '')
      setSourceLabel(options.sourceLabel ?? 'Imported source image')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Image could not be loaded.')
    } finally {
      setIsLoadingImage(false)
    }
  }, [])

  const loadSvgSource = useCallback(
    async (svg: string, fileName: string, sourceLabel = 'Generated source SVG') => {
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
      setStatus('Use PNG, JPG, JPEG, WEBP, or SVG.')
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

    setStatus('Drop an image file to generate a mark.')
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
      setStatus('Press Cmd+V or Ctrl+V after copying an image.')
      return
    }

    try {
      setStatus('Reading clipboard...')
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
      setStatus('Clipboard permission was not granted. Try Cmd+V or Ctrl+V.')
    }
  }, [loadImageFile])

  const loadSampleSource = useCallback(async () => {
    await loadSvgSource(SAMPLE_SOURCE_SVG, 'veyra-test-source.svg', 'Test source SVG')
  }, [loadSvgSource])

  const generatePromptMotif = async (variant = motifVariant) => {
    const cleanPrompt = prompt.trim()

    if (!cleanPrompt) {
      setStatus('Enter a prompt first.')
      return
    }

    try {
      setIsGeneratingPrompt(true)
      setStatus('Generating motif...')

      const response = await fetch('/api/generate-pixel-motif', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: cleanPrompt, style: motifStyle, variant }),
      })

      if (!response.ok) {
        throw new Error('Claude endpoint is not configured yet. Using local motif generation.')
      }

      const data = (await response.json()) as { svg?: unknown; source?: unknown }

      if (typeof data.svg !== 'string' || !data.svg.includes('<svg')) {
        throw new Error('Claude returned no usable SVG. Using local motif generation.')
      }

      await loadSvgSource(data.svg, 'claude-pixel-source.svg', `Claude ${motifStyle} source`)
      setStatus(data.source === 'claude' ? 'Claude motif generated.' : 'Motif generated.')
    } catch {
      await loadSvgSource(createLocalPromptSvg(cleanPrompt, { style: motifStyle, variant }), 'local-prompt-source.svg', `Local ${motifStyle} source`)
      setStatus('Local prompt motif generated. Add ANTHROPIC_API_KEY on Vercel to use Claude.')
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
          ? 'Image loaded. Adjust the mark or export it.'
          : 'No elements generated. Lower the threshold or enable invert.',
      )
    } catch (error) {
      setGrid(null)
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

  const handleExportPng = async () => {
    if (!grid) {
      setStatus('Load an image before exporting PNG.')
      return
    }

    try {
      await downloadPng(grid, settings)
      setStatus('PNG downloaded.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'PNG export failed.')
    }
  }

  const handleExportSvg = () => {
    if (!grid) {
      setStatus('Load an image before exporting SVG.')
      return
    }

    downloadSvg(grid, settings)
    setStatus('SVG export started.')
  }

  const handleExportHtml = () => {
    if (!grid) {
      setStatus('Load or generate an image before exporting HTML.')
      return
    }

    downloadHtml(grid, settings)
    setStatus('HTML downloaded.')
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

  const handleDownloadSourceSvg = () => {
    if (!sourceSvg) {
      setStatus('Generate a prompt motif before downloading the source SVG.')
      return
    }

    downloadTextFile(sourceSvg, 'veyra-source-motif.svg', 'image/svg+xml;charset=utf-8')
    setStatus('Source SVG downloaded.')
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
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <h1>Veyra Pixel Generator</h1>
            <p>{sourceMeta}</p>
          </div>
        </div>

        <div className="toolbar" aria-label="Generator actions">
          <label className="button button-primary upload-label" htmlFor={IMAGE_INPUT_ID}>
            Load image
          </label>
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
          <button className="button" type="button" disabled={!grid} onClick={handleExportHtml}>
            Export HTML
          </button>
        </div>
      </header>

      <section className="workspace">
        <section className="preview-column" aria-label="Generated mark preview">
          <section className="prompt-panel" aria-label="AI motif generator">
            <div className="prompt-copy">
              <h2>AI motif</h2>
              <p>Describe a symbol. Claude can generate the source motif; local fallback works immediately.</p>
            </div>
            <div className="prompt-stack">
              <div className="prompt-input-row">
                <textarea
                  value={prompt}
                  rows={2}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="e.g. abstract Veyra compass, premium modular flower, quiet festival monogram"
                />
                <button
                  className="button button-primary prompt-button"
                  type="button"
                  onClick={() => void generatePromptMotif()}
                  disabled={isGeneratingPrompt}
                >
                  {isGeneratingPrompt ? 'Generating...' : 'Generate pixel mark'}
                </button>
              </div>
              <div className="prompt-tools">
                <div className="segmented prompt-style-control" aria-label="Motif style">
                  {MOTIF_STYLES.map((style) => (
                    <button
                      key={style.value}
                      type="button"
                      className={motifStyle === style.value ? 'is-active' : ''}
                      onClick={() => setMotifStyle(style.value)}
                    >
                      {style.label}
                    </button>
                  ))}
                </div>
                <button className="button" type="button" onClick={generateNextVariant} disabled={isGeneratingPrompt || !prompt.trim()}>
                  New variant
                </button>
              </div>
            </div>
          </section>

          <div className={`preview-frame preview-${previewBackground}`} onDoubleClick={openFilePicker}>
            <canvas ref={previewCanvasRef} className="preview-canvas" aria-label="Generated pixel mark preview" />

            {!grid && (
              <div className="empty-state">
                <div className="empty-card">
                  <p className="empty-kicker">{isDragging ? 'Release to load' : 'Image input'}</p>
                  <strong>{isLoadingImage ? 'Loading image...' : 'Drop an image here'}</strong>
                  <span>PNG, JPG, WEBP, or SVG stays local in your browser.</span>
                  <div className="empty-actions">
                    <label className="button button-primary upload-label" htmlFor={IMAGE_INPUT_ID}>
                      Choose image
                    </label>
                    <button className="button" type="button" onClick={pasteFromClipboard}>
                      Paste image
                    </button>
                    <button className="button" type="button" onClick={loadSampleSource}>
                      Test source
                    </button>
                  </div>
                </div>
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
            <h3>Source</h3>
            <div className="source-card">
              <div className="source-thumb">
                {sourcePreviewUrl ? <img src={sourcePreviewUrl} alt="" /> : <span>No source</span>}
              </div>
              <div>
                <strong>{sourceLabel}</strong>
                <p>{imageName || 'Generate or load a source image.'}</p>
              </div>
            </div>
            <div className="export-grid">
              <button className="button" type="button" onClick={loadSampleSource}>
                Test source
              </button>
              <button className="button" type="button" disabled={!sourceSvg} onClick={handleDownloadSourceSvg}>
                Source SVG
              </button>
            </div>
          </section>

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
              <button className="button" type="button" disabled={!grid} onClick={handleExportHtml}>
                HTML
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
