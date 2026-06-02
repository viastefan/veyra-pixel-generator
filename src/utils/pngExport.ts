import type { GeneratedGrid, GeneratorSettings } from '../types'
import { drawPixelMark } from './imageProcessing'

export function downloadPng(grid: GeneratedGrid, settings: GeneratorSettings, fileName = 'veyra-pixel-mark.png') {
  const canvas = document.createElement('canvas')
  canvas.width = grid.outputSize
  canvas.height = grid.outputSize

  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('PNG export canvas is not available.')
  }

  drawPixelMark(context, grid, settings)

  return new Promise<void>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('PNG export failed. The browser did not create a file.'))
        return
      }

      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = fileName
      anchor.click()
      URL.revokeObjectURL(url)
      resolve()
    }, 'image/png')
  })
}
