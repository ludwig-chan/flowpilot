import { app } from 'electron'
import { join } from 'path'

const TESS_LANGS = ['chi_sim', 'eng'] as const

/** Worker 单例 */
let workerPromise: Promise<unknown> | null = null
let workerReady = false

/**
 * 获取或创建 OCR Worker 单例。
 * 首次调用时创建 Worker 并设置优化参数，后续调用直接返回已有 Worker。
 */
async function getOcrWorker(): Promise<unknown> {
  if (workerPromise && workerReady) {
    return workerPromise
  }

  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker, PSM } = await import('tesseract.js')
      const langPath = join(app.getPath('userData'), 'tessdata')

      const worker = await createWorker(TESS_LANGS as unknown as string[], 1, {
        cachePath: langPath,
        cacheMethod: 'write',
      })

      // 设置优化参数
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        preserve_interword_spaces: '1',
        user_defined_dpi: '300',
        tessjs_create_hocr: '0',
        tessjs_create_tsv: '0',
      })

      workerReady = true
      console.log('[OCR] Tesseract Worker 初始化完成（备用引擎）')
      return worker
    })()
  }

  return workerPromise
}

/**
 * 使用 Tesseract.js 识别文本（备用引擎）。
 * @param imageInput 预处理后的图片 Buffer 或 dataUrl
 * @returns 识别出的文本
 */
export async function recognizeText(imageInput: string | Buffer): Promise<string> {
  const worker = (await getOcrWorker()) as {
    recognize: (input: string | Buffer) => Promise<{ data: { text: string } }>
  }
  const { data: { text } } = await worker.recognize(imageInput)
  return text.trim()
}

/**
 * 应用退出时清理 Worker。
 */
export async function terminateOcrWorker(): Promise<void> {
  if (workerPromise) {
    try {
      const worker = (await workerPromise) as { terminate: () => Promise<void> }
      await worker.terminate()
    } catch {
      // 忽略终止错误
    }
    workerPromise = null
    workerReady = false
  }
}

/**
 * 预下载 Tesseract 语言包（仅备用引擎使用）。
 */
export async function prefetchTessdata(): Promise<void> {
  const { existsSync, mkdirSync: mkdir } = await import('fs')
  const langPath = join(app.getPath('userData'), 'tessdata')
  const allCached = TESS_LANGS.every((lang) =>
    existsSync(join(langPath, `${lang}.traineddata`))
  )
  if (allCached) return

  mkdir(langPath, { recursive: true })
  try {
    const { createWorker } = await import('tesseract.js')
    const worker = await createWorker(TESS_LANGS as unknown as string[], 1, {
      cachePath: langPath,
      cacheMethod: 'write',
    })
    await worker.terminate()
    console.log('[OCR] Tesseract 语言包预下载完成')
  } catch (err) {
    console.warn('[OCR] Tesseract 语言包预下载失败，将在首次使用时重试：', (err as Error).message)
  }
}
