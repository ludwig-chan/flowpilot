import { preprocessImageForOcr } from './ocrPreprocess'
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

  // 步骤2: 降级到 Windows OCR（使用预处理后的图片）
  if (isWindowsOcrAvailable()) {
    const preprocessed = await preprocessImageForOcr(dataUrl)
    const text = await recognizeWithWindowsOcr(preprocessed)
    console.log('[OCR] Windows OCR 识别成功（备用引擎）')
    return text
  }

  throw new Error('没有可用的 OCR 引擎：PaddleOCR 不可用，Windows OCR 不可用')
}
