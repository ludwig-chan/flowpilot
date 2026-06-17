import { preprocessImageForOcr } from './ocrPreprocess'
import {
  checkWindowsOcrAvailability,
  isWindowsOcrAvailable,
  recognizeWithWindowsOcr,
} from './ocrWindows'
import { recognizeText as recognizeWithTesseract } from './ocrWorker'

/**
 * 初始化 OCR 引擎（启动时调用）。
 * 检测 Windows OCR 可用性并缓存结果。
 */
export async function initOcrEngine(): Promise<void> {
  await checkWindowsOcrAvailability()
}

/**
 * 统一 OCR 识别入口。
 * 自动选择最优引擎：Windows OCR（主） → Tesseract.js（备用）。
 *
 * @param dataUrl 图片的 data URL
 * @returns 识别出的文本
 */
export async function recognizeText(dataUrl: string): Promise<string> {
  // 步骤1: 图像预处理
  const preprocessed = await preprocessImageForOcr(dataUrl)

  // 步骤2: 选择引擎
  if (isWindowsOcrAvailable()) {
    try {
      const text = await recognizeWithWindowsOcr(preprocessed)
      console.log('[OCR] Windows OCR 识别成功')
      return text
    } catch (err) {
      console.warn('[OCR] Windows OCR 识别失败，降级到 Tesseract:', (err as Error).message)
      // 降级到 Tesseract
    }
  }

  // 步骤3: 降级到 Tesseract.js
  const text = await recognizeWithTesseract(preprocessed)
  console.log('[OCR] Tesseract.js 识别完成（备用引擎）')
  return text
}
