import { PaddleOcrService } from 'ppu-paddle-ocr'

const MODEL_BASE_URL =
  'https://media.githubusercontent.com/media/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models/main'
const DICT_BASE_URL =
  'https://raw.githubusercontent.com/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models/main'

/** PaddleOCR 服务单例 */
let service: PaddleOcrService | null = null
let available = false

/**
 * 初始化 PaddleOCR 服务。
 * 首次运行会自动下载模型文件到本地缓存（~/.cache/ppu-paddle-ocr）。
 * 使用 PP-OCRv5 中文模型，支持中英混合识别。
 * 初始化失败时 available 置为 false，上层自动降级到 Windows OCR。
 */
export async function initPaddleOcr(): Promise<void> {
  if (service) return

  try {
    service = new PaddleOcrService({
      model: {
        recognition: `${MODEL_BASE_URL}/recognition/PP-OCRv5_mobile_rec_infer.onnx`,
        charactersDictionary: `${DICT_BASE_URL}/recognition/ppocrv5_dict.txt`,
      },
    })
    await service.initialize()
    available = true
    console.log('[OCR] PaddleOCR 初始化完成（主引擎）')
  } catch (err) {
    console.warn('[OCR] PaddleOCR 初始化失败，将降级到 Windows OCR:', (err as Error).message)
    service = null
    available = false
  }
}

/**
 * PaddleOCR 是否可用（初始化成功后为 true）。
 */
export function isPaddleOcrAvailable(): boolean {
  return available
}

/**
 * 使用 PaddleOCR 识别图片中的文字。
 * @param imageBuffer 原始图片 Buffer（不做预处理）
 * @returns 识别出的文本
 */
export async function recognizeWithPaddleOcr(imageBuffer: Buffer): Promise<string> {
  if (!service || !available) {
    throw new Error('PaddleOCR 服务未初始化')
  }

  // Buffer → ArrayBuffer
  const arrayBuffer = imageBuffer.buffer.slice(
    imageBuffer.byteOffset,
    imageBuffer.byteOffset + imageBuffer.byteLength
  ) as ArrayBuffer

  const result = await service.recognize(arrayBuffer)
  return (result.text || '').trim()
}

/**
 * 销毁 PaddleOCR 服务，释放 ONNX 推理会话资源。
 */
export async function destroyPaddleOcr(): Promise<void> {
  if (service) {
    try {
      await service.destroy()
    } catch {
      // 忽略销毁错误
    }
    service = null
    available = false
  }
}
