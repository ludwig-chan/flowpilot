import { extname } from 'path'
import { readFileSync, existsSync } from 'fs'
import type { AttachmentItem } from './attachmentLibrary'
import {
  getAttachmentPath,
  updateAttachmentOcr,
  updateAttachmentOcrStatus,
} from './attachmentLibrary'
import { recognizePdf } from './pdfOcr'
import { recognizeTextFromBuffer } from './ocrEngine'

// ─── 常量 ──────────────────────────────────────────────────────────────────────

const OCR_IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.bmp', '.webp']

// ─── 实现 ──────────────────────────────────────────────────────────────────────

/**
 * 对附件执行 OCR 识别。
 *
 * - PDF 附件：调用 pdfOcr.recognizePdf，逐页文本提取 + 扫描件 OCR
 * - 图片附件：调用 ocrEngine.recognizeTextFromBuffer
 * - 其他类型：跳过
 *
 * 通过 updateAttachmentOcr / updateAttachmentOcrStatus 更新附件库中的 OCR 状态。
 *
 * @param item 附件记录
 */
export async function processAttachment(item: AttachmentItem): Promise<void> {
  const ext = extname(item.filename).toLowerCase()

  if (ext !== '.pdf' && !OCR_IMAGE_EXTS.includes(ext)) {
    return
  }

  updateAttachmentOcrStatus(item.id, 'processing')

  try {
    const filePath = getAttachmentPath(item.id)
    if (!filePath || !existsSync(filePath)) {
      throw new Error('附件文件不存在')
    }

    if (ext === '.pdf') {
      const result = await recognizePdf(filePath)
      updateAttachmentOcr(item.id, result.text)
      console.log(
        `[AttachmentOCR] PDF OCR 完成: ${item.filename} (${result.pageResults.length} 页)`,
      )
    } else {
      const buffer = readFileSync(filePath)
      const text = await recognizeTextFromBuffer(buffer)
      updateAttachmentOcr(item.id, text)
      console.log(`[AttachmentOCR] 图片 OCR 完成: ${item.filename}`)
    }
  } catch (err) {
    const message = (err as Error).message
    console.error(`[AttachmentOCR] OCR 失败: ${item.filename} - ${message}`)
    updateAttachmentOcrStatus(item.id, 'failed')
  }
}
