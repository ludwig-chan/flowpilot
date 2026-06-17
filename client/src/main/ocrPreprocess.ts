import sharp from 'sharp'

/** OCR 预处理配置 */
interface PreprocessOptions {
  /** 目标最小宽度（低于此值将放大），默认 1200 */
  minWidth?: number
  /** 是否转灰度，默认 true */
  grayscale?: boolean
  /** 对比度增强因子，默认 1.5（1.0 = 不变） */
  contrastFactor?: number
  /** 是否锐化，默认 true */
  sharpen?: boolean
  /** 锐化 sigma 值，默认 1.0 */
  sharpenSigma?: number
}

const DEFAULT_OPTIONS: Required<PreprocessOptions> = {
  minWidth: 1200,
  grayscale: true,
  contrastFactor: 1.5,
  sharpen: true,
  sharpenSigma: 1.0,
}

/**
 * 对 dataUrl 图片进行 OCR 预处理，返回预处理后的 PNG Buffer。
 *
 * 处理步骤：
 * 1. 若宽度低于 minWidth，用 Lanczos3 高质量算法按比例放大
 * 2. 转灰度（消除颜色干扰）
 * 3. 线性对比度增强（使文字与背景区分更明显）
 * 4. 轻度锐化（使文字边缘更清晰）
 * 5. 输出为 PNG Buffer
 */
export async function preprocessImageForOcr(
  dataUrl: string,
  options?: PreprocessOptions
): Promise<Buffer> {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  // 从 dataUrl 提取纯 Buffer
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
  const inputBuffer = Buffer.from(base64, 'base64')

  let pipeline = sharp(inputBuffer)

  // 获取原始尺寸
  const metadata = await pipeline.metadata()
  const origWidth = metadata.width ?? 0
  const origHeight = metadata.height ?? 0

  // 步骤1: 若图片过小，放大到目标尺寸（Lanczos3 高质量缩放）
  if (origWidth > 0 && origWidth < opts.minWidth) {
    const scale = opts.minWidth / origWidth
    const newWidth = Math.round(origWidth * scale)
    const newHeight = Math.round(origHeight * scale)
    pipeline = pipeline.resize(newWidth, newHeight, {
      kernel: sharp.kernel.lanczos3,
    })
  }

  // 步骤2: 转灰度
  if (opts.grayscale) {
    pipeline = pipeline.grayscale()
  }

  // 步骤3: 对比度增强
  // linear(a, b): pixel = pixel * a + b
  // b = -(128 * (a - 1)) 保持中间灰度不变
  if (opts.contrastFactor !== 1.0) {
    const a = opts.contrastFactor
    const b = -(128 * (a - 1))
    pipeline = pipeline.linear(a, b)
  }

  // 步骤4: 轻度锐化
  if (opts.sharpen) {
    pipeline = pipeline.sharpen({ sigma: opts.sharpenSigma })
  }

  // 步骤5: 输出为 PNG Buffer
  return pipeline.png().toBuffer()
}
