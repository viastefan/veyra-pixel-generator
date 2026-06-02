export type ShapeMode = 'square' | 'circle' | 'rounded-square'

export type ToneMode = 'one' | 'two'

export type PreviewBackground = 'dark' | 'light' | 'transparent'

export type MotifStyle = 'monogram' | 'emblem' | 'orbital' | 'signal'

export interface GeneratorSettings {
  gridSize: number
  elementSize: number
  smallSquareRatio: number
  threshold: number
  contrast: number
  invert: boolean
  tones: ToneMode
  shape: ShapeMode
  bgColor: string
  primaryColor: string
  secondaryColor: string
  accentColor: string
  transparentBg: boolean
  outputSize: number
  padding: number
}

export interface GridElement {
  id: string
  row: number
  column: number
  x: number
  y: number
  size: number
  brightness: number
  strength: number
  tone: 'primary' | 'secondary'
  color: string
}

export interface GeneratedGrid {
  elements: GridElement[]
  gridSize: number
  outputSize: number
  padding: number
  cellSize: number
  sourceWidth: number
  sourceHeight: number
}
