import { readFileSync } from 'fs'
import * as pdfjsLib from 'pdfjs-dist'
import { createCanvas } from '@napi-rs/canvas'
import { recognizeTextFromBuffer } from './ocrEngine'

// ─── 类型 ──────────────────────────────────────────────────────────────────────

export interface PageResult {
  pageNum: number
  method: 'text' | 'ocr'
  text: string
}

export interface PdfOcrResult {
  /** 所有页面文本的聚合结果 */
  text: string
  pageResults: PageResult[]
}

// ─── 实现 ──────────────────────────────────────────────────────────────────────

/**
 * 识别 PDF 文件中的文本。
 *
 * 逐页处理：
 * 1. 尝试 extract text layer（文字型 PDF）
 * 2. 若文本层为空，渲染页面为图片并 OCR（扫描件 PDF）
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

    // 步骤1: 尝试直接提取文本层
    const textContent = await page.getTextContent()
    const text = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .trim()

    if (text) {
      pageResults.push({ pageNum: i, method: 'text', text })
      continue
    }

    // 步骤2: 文本为空（扫描件 / 图片型 PDF），渲染为图片走 OCR
    const viewport = page.getViewport({ scale: 2.0 })
    const canvas = createCanvas(viewport.width, viewport.height)
    const ctx = canvas.getContext('2d')

    await page.render({
      canvas: canvas as unknown as HTMLCanvasElement,
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      viewport,
    }).promise

    const pngBuffer = canvas.toBuffer('image/png')
    const ocrText = await recognizeTextFromBuffer(pngBuffer)

    pageResults.push({ pageNum: i, method: 'ocr', text: ocrText })
  }

  const fullText = pageResults
    .map((p) => p.text)
    .filter(Boolean)
    .join('\n')

  return { text: fullText, pageResults }
}
