import { readFileSync } from 'fs'
import * as pdfjsLib from 'pdfjs-dist'

// ─── 类型 ──────────────────────────────────────────────────────────────────────

export interface PageResult {
  pageNum: number
  method: 'text' | 'skipped'
  text: string
}

export interface PdfOcrResult {
  /** 所有页面文本的聚合结果 */
  text: string
  pageResults: PageResult[]
}

// ─── 实现 ──────────────────────────────────────────────────────────────────────

/**
 * 识别 PDF 文件中的文本（仅支持文字型 PDF）。
 *
 * 逐页处理：
 * 1. 尝试提取 text layer（文字型 PDF）
 * 2. 若文本层为空（扫描件），跳过该页
 *
 * @param filePath PDF 文件的绝对路径
 * @returns 识别结果
 */
export async function recognizePdf(filePath: string): Promise<PdfOcrResult> {
  const data = new Uint8Array(readFileSync(filePath))
  const pdf = await pdfjsLib.getDocument({ data }).promise

  const pageResults: PageResult[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)

    // 尝试直接提取文本层
    const textContent = await page.getTextContent()
    const text = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .trim()

    if (text) {
      pageResults.push({ pageNum: i, method: 'text', text })
    } else {
      pageResults.push({
        pageNum: i,
        method: 'skipped',
        text: '（此页面为扫描件，暂不支持 OCR 识别）',
      })
    }
  }

  const fullText = pageResults
    .map((p) => p.text)
    .filter(Boolean)
    .join('\n')

  return { text: fullText, pageResults }
}
