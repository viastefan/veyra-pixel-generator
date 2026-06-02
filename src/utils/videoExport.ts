import type { GeneratedGrid, GeneratorSettings, GridElement } from '../types'
import { getSmartMotionPlan } from './htmlExport'

const FPS = 30
const DURATION_MS = 3600
const INTRO_HOLD_MS = 320
const REDUCE_MS = 2100
const OUTRO_HOLD_MS = DURATION_MS - INTRO_HOLD_MS - REDUCE_MS

const waitForVideoFrame = () => new Promise<void>((resolve) => window.setTimeout(resolve, 1000 / FPS))

const pickVideoMimeType = () => {
  const types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']

  return types.find((type) => MediaRecorder.isTypeSupported(type)) ?? ''
}

const ease = (value: number) => {
  const t = Math.min(Math.max(value, 0), 1)
  return t * t * (3 - 2 * t)
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

function drawElement(
  context: CanvasRenderingContext2D,
  element: GridElement,
  settings: GeneratorSettings,
  opacity: number,
  scale: number,
  offsetX: number,
  offsetY: number,
) {
  const half = element.size / 2

  context.save()
  context.globalAlpha = opacity
  context.translate(element.x + offsetX, element.y + offsetY)
  context.scale(scale, scale)
  context.fillStyle = element.color

  if (settings.shape === 'circle') {
    context.beginPath()
    context.arc(0, 0, half, 0, Math.PI * 2)
    context.fill()
    context.restore()
    return
  }

  if (settings.shape === 'rounded-square') {
    drawRoundedRect(context, -half, -half, element.size, element.size, element.size * 0.22)
    context.fill()
    context.restore()
    return
  }

  context.fillRect(-half, -half, element.size, element.size)
  context.restore()
}

function renderSmartMotionFrame(
  context: CanvasRenderingContext2D,
  grid: GeneratedGrid,
  settings: GeneratorSettings,
  elements: ReturnType<typeof getSmartMotionPlan>,
  elapsedMs: number,
) {
  context.clearRect(0, 0, grid.outputSize, grid.outputSize)

  if (!settings.transparentBg) {
    context.fillStyle = settings.bgColor
    context.fillRect(0, 0, grid.outputSize, grid.outputSize)
  } else {
    context.fillStyle = '#070B12'
    context.fillRect(0, 0, grid.outputSize, grid.outputSize)
  }

  for (const { element, keep, order, offsetX, offsetY } of elements) {
    const delay = order * 0.52
    const progress = ease((elapsedMs - INTRO_HOLD_MS - delay) / REDUCE_MS)
    const settle = ease((elapsedMs - INTRO_HOLD_MS - REDUCE_MS) / Math.max(OUTRO_HOLD_MS, 1))

    if (keep) {
      const pulse = Math.sin(progress * Math.PI) * 0.08
      const scale = 1 + pulse * (1 - settle)
      drawElement(context, element, settings, 1, scale, 0, 0)
      continue
    }

    const opacity = Math.max(0, 1 - progress)
    const scale = Math.max(0.16, 1 - progress * 0.84)
    const travelX = offsetX * 0.025 * progress
    const travelY = offsetY * 0.025 * progress

    if (opacity > 0.01) {
      drawElement(context, element, settings, opacity, scale, travelX, travelY)
    }
  }
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

export async function downloadSmartMotionVideo(
  grid: GeneratedGrid,
  settings: GeneratorSettings,
  fileName = 'veyra-pixel-motion.webm',
) {
  if (!('MediaRecorder' in window)) {
    throw new Error('Video-Export wird in diesem Browser nicht unterstützt.')
  }

  const mimeType = pickVideoMimeType()

  if (!mimeType) {
    throw new Error('Dieser Browser kann kein WebM-Video aufnehmen.')
  }

  const canvas = document.createElement('canvas')
  canvas.width = grid.outputSize
  canvas.height = grid.outputSize

  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Video-Canvas konnte nicht erstellt werden.')
  }

  const stream = canvas.captureStream(FPS)
  const chunks: Blob[] = []
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 })
  const stopped = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data)
      }
    }
    recorder.onerror = () => reject(new Error('Videoaufnahme fehlgeschlagen.'))
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }))
  })

  const motionElements = getSmartMotionPlan(grid)

  renderSmartMotionFrame(context, grid, settings, motionElements, 0)
  recorder.start()

  const frameCount = Math.ceil((DURATION_MS / 1000) * FPS)

  for (let frame = 0; frame <= frameCount; frame += 1) {
    const elapsedMs = (frame / frameCount) * DURATION_MS
    renderSmartMotionFrame(context, grid, settings, motionElements, elapsedMs)
    await waitForVideoFrame()
  }

  if (recorder.state === 'recording') {
    recorder.requestData()
  }
  recorder.stop()

  const blob = await stopped
  stream.getTracks().forEach((track) => track.stop())
  downloadBlob(blob, fileName)
}
