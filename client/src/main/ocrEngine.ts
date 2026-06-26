import {
  checkWindowsOcrAvailability,
  isWindowsOcrAvailable,
  recognizeWithWindowsOcr,
} from './ocrWindows'
import {
  initPaddleOcr,
  isPaddleOcrAvailable,
  recognizeWithPaddleOcr,
} from './ocrPaddle'

/**
 * 初始化 OCR 引擎（启动时调用）。
 * 检测 Windows OCR 可用性并尝试初始化 PaddleOCR。
 */
export async function initOcrEngine(): Promise<void> {
  await checkWindowsOcrAvailability()
  // PaddleOCR 异步初始化（模型下载可能耗时），不阻塞启动
  void initPaddleOcr()
}

/**
 * 统一 OCR 识别入口。
 * 自动选择最优引擎：PaddleOCR（主） → Windows OCR（备用）。
 *
 * @param dataUrl 图片的 data URL
 * @returns 识别出的文本
 */
export async function recognizeText(dataUrl: string): Promise<string> {
  // 步骤1: 尝试 PaddleOCR（使用原图，不做预处理）
  if (isPaddleOcrAvailable()) {
    try {
      const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
      const rawBuffer = Buffer.from(base64, 'base64')
      const text = await recognizeWithPaddleOcr(rawBuffer)
      console.log('[OCR] PaddleOCR 识别成功')
      return text
    } catch (err) {
      console.warn('[OCR] PaddleOCR 识别失败，降级到 Windows OCR:', (err as Error).message)
    }
  }

  // 步骤2: 降级到 Windows OCR
  if (isWindowsOcrAvailable()) {
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
    const rawBuffer = Buffer.from(base64, 'base64')
    const text = await recognizeWithWindowsOcr(rawBuffer)
    console.log('[OCR] Windows OCR 识别成功（备用引擎）')
    return text
  }

  throw new Error('没有可用的 OCR 引擎：PaddleOCR 不可用，Windows OCR 不可用')
}

/**
 * 统一 OCR 识别入口（Buffer 版本）。
 * 适用于已有原始图片 Buffer 的场景（如 PDF 渲染、图片文件读取）。
 * 自动选择最优引擎：PaddleOCR（主） → Windows OCR（备用）。
 *
 * @param imageBuffer 原始图片 Buffer（PNG / JPEG 等）
 * @returns 识别出的文本
 */
export async function recognizeTextFromBuffer(imageBuffer: Buffer): Promise<string> {
  // 步骤1: 尝试 PaddleOCR（使用原图，不做预处理）
  if (isPaddleOcrAvailable()) {
    try {
      const text = await recognizeWithPaddleOcr(imageBuffer)
      console.log('[OCR] PaddleOCR 识别成功')
      return text
    } catch (err) {
      console.warn('[OCR] PaddleOCR 识别失败，降级到 Windows OCR:', (err as Error).message)
    }
  }

  // 步骤2: 降级到 Windows OCR
  if (isWindowsOcrAvailable()) {
    const text = await recognizeWithWindowsOcr(imageBuffer)
    console.log('[OCR] Windows OCR 识别成功（备用引擎）')
    return text
  }

  throw new Error('没有可用的 OCR 引擎：PaddleOCR 不可用，Windows OCR 不可用')
}
