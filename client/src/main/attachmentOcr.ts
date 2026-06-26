import { extname } from 'path'
import { readFileSync, existsSync } from 'fs'
import type { AttachmentItem } from './attachmentLibrary'
import {
  getAttachmentPath,
  updateAttachmentOcr,
  updateAttachmentOcrStatus,
} from './attachmentLibrary'
import { recognizeTextFromBuffer } from './ocrEngine'

// ─── 常量 ──────────────────────────────────────────────────────────────────────

const OCR_IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.bmp', '.webp']

// ─── 实现 ──────────────────────────────────────────────────────────────────────

/**
 * 对附件执行 OCR 识别。
 *
 * - 图片附件：调用 ocrEngine.recognizeTextFromBuffer
 * - PDF 及其他类型：跳过本地 OCR
 *
 * 通过 updateAttachmentOcr / updateAttachmentOcrStatus 更新附件库中的 OCR 状态。
 *
 * @param item 附件记录
 */
export async function processAttachment(item: AttachmentItem): Promise<void> {
  const ext = extname(item.filename).toLowerCase()

  if (!OCR_IMAGE_EXTS.includes(ext)) {
    return
  }

  updateAttachmentOcrStatus(item.id, 'processing')

  try {
    const filePath = getAttachmentPath(item.id)
    if (!filePath || !existsSync(filePath)) {
      throw new Error('附件文件不存在')
    }

    const buffer = readFileSync(filePath)
    const text = await recognizeTextFromBuffer(buffer)
    updateAttachmentOcr(item.id, text)
    console.log(`[AttachmentOCR] 图片 OCR 完成: ${item.filename}`)
  } catch (err) {
    const message = (err as Error).message
    console.error(`[AttachmentOCR] OCR 失败: ${item.filename} - ${message}`)
    updateAttachmentOcrStatus(item.id, 'failed')
  }
}
