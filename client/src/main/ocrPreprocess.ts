import { createCanvas, loadImage } from '@napi-rs/canvas'

interface PreprocessOptions {
  minWidth?: number
  grayscale?: boolean
  contrastFactor?: number
  sharpen?: boolean
  sharpenSigma?: number
}

const DEFAULT_OPTIONS: Required<PreprocessOptions> = {
  minWidth: 1200,
  grayscale: true,
  contrastFactor: 1.5,
  sharpen: true,
  sharpenSigma: 1.0,
}

function clamp(value: number, min: number = 0, max: number = 255): number {
  return Math.min(Math.max(value, min), max)
}

function applyGrayscale(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
    data[i] = gray
    data[i + 1] = gray
    data[i + 2] = gray
  }
}

function applyContrast(data: Uint8ClampedArray, factor: number): void {
  const b = -(128 * (factor - 1))
  for (let i = 0; i < data.length; i += 4) {
    data[i] = clamp(data[i] * factor + b)
    data[i + 1] = clamp(data[i + 1] * factor + b)
    data[i + 2] = clamp(data[i + 2] * factor + b)
  }
}

function applySharpen(data: Uint8ClampedArray, width: number, height: number): void {
  const kernel = [
    0, -1, 0,
    -1, 5, -1,
    0, -1, 0
  ]
  const tempData = new Uint8ClampedArray(data.length)
  tempData.set(data)

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let r = 0, g = 0, b = 0
      for (let ky = 0; ky < 3; ky++) {
        for (let kx = 0; kx < 3; kx++) {
          const px = x + kx - 1
          const py = y + ky - 1
          const idx = (py * width + px) * 4
          const weight = kernel[ky * 3 + kx]
          r += tempData[idx] * weight
          g += tempData[idx + 1] * weight
          b += tempData[idx + 2] * weight
        }
      }
      const idx = (y * width + x) * 4
      data[idx] = clamp(r)
      data[idx + 1] = clamp(g)
      data[idx + 2] = clamp(b)
    }
  }
}

export async function preprocessImageForOcr(
  dataUrl: string,
  options?: PreprocessOptions
): Promise<Buffer> {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
  const inputBuffer = Buffer.from(base64, 'base64')

  const img = await loadImage(inputBuffer)
  const origWidth = img.width
  const origHeight = img.height

  let finalWidth = origWidth
  let finalHeight = origHeight

  if (origWidth > 0 && origWidth < opts.minWidth) {
    const scale = opts.minWidth / origWidth
    finalWidth = Math.round(origWidth * scale)
    finalHeight = Math.round(origHeight * scale)
  }

  const canvas = createCanvas(finalWidth, finalHeight)
  const ctx = canvas.getContext('2d')

  ctx.drawImage(img, 0, 0, finalWidth, finalHeight)

  const imageData = ctx.getImageData(0, 0, finalWidth, finalHeight)
  const data = imageData.data

  if (opts.grayscale) {
    applyGrayscale(data)
  }

  if (opts.contrastFactor !== 1.0) {
    applyContrast(data, opts.contrastFactor)
  }

  if (opts.sharpen) {
    applySharpen(data, finalWidth, finalHeight)
  }

  ctx.putImageData(imageData, 0, 0)

  return canvas.toBuffer('image/png')
}
