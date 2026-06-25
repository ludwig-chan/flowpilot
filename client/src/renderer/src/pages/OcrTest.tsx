import React, { useState, useRef } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

interface OcrResult {
  id: number
  type: 'image' | 'pdf'
  imageUrl?: string
  fileName?: string
  text: string
  loading: boolean
  error?: string
  pageMethods?: Array<{ pageNum: number; method: 'text' | 'ocr' }>
}

export default function OcrTest(): React.JSX.Element {
  const [results, setResults] = useState<OcrResult[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const processImage = (file: File): void => {
    const reader = new FileReader()
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string
      const id = Date.now() + Math.random()
      const result: OcrResult = {
        id,
        type: 'image',
        imageUrl: dataUrl,
        fileName: file.name,
        text: '',
        loading: true
      }
      setResults((prev) => [result, ...prev])
      try {
        const ocrResult = await window.api.ocrImage(dataUrl)
        setResults((prev) =>
          prev.map((r) =>
            r.id === id
              ? {
                  ...r,
                  text: ocrResult.success ? ocrResult.text ?? '' : '',
                  loading: false,
                  error: ocrResult.success ? undefined : ocrResult.error
                }
              : r
          )
        )
      } catch (err) {
        setResults((prev) =>
          prev.map((r) =>
            r.id === id ? { ...r, loading: false, error: (err as Error).message } : r
          )
        )
      }
    }
    reader.readAsDataURL(file)
  }

  const processPdf = async (file: File, arrayBuffer: ArrayBuffer, id: number): Promise<void> => {
    const result: OcrResult = {
      id,
      type: 'pdf',
      fileName: file.name,
      text: '',
      loading: true,
      pageMethods: []
    }
    setResults((prev) => [result, ...prev])

    try {
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      const pageTexts: string[] = []
      const pageMethods: Array<{ pageNum: number; method: 'text' | 'ocr' }> = []

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)

        // 步骤1: 尝试直接提取文本
        const textContent = await page.getTextContent()
        const text = textContent.items.map((item) => ('str' in item ? item.str : '')).join(' ')

        if (text.trim()) {
          pageTexts.push(text.trim())
          pageMethods.push({ pageNum: i, method: 'text' })
          continue
        }

        // 步骤2: 文本为空（扫描件/图片型PDF），渲染为图片走OCR
        const viewport = page.getViewport({ scale: 2.0 })
        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height

        await page.render({ canvas, viewport }).promise
        const dataUrl = canvas.toDataURL('image/png')

        const ocrResult = await window.api.ocrImage(dataUrl)
        const ocrText = ocrResult.success ? (ocrResult.text || '') : ''
        pageTexts.push(ocrText)
        pageMethods.push({ pageNum: i, method: 'ocr' })
      }

      // 拼接所有页文字，标注来源
      const fullText = pageTexts
        .map((pageText, idx) => {
          const pm = pageMethods[idx]
          const label = pm.method === 'text' ? '[文本提取]' : '[OCR识别]'
          return `--- 第${pm.pageNum}页 ${label} ---\n${pageText}`
        })
        .join('\n\n')

      setResults((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, text: fullText, loading: false, pageMethods } : r
        )
      )
    } catch (err) {
      setResults((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, loading: false, error: (err as Error).message } : r
        )
      )
    }
  }

  const handleFileSelect = async (files: FileList | null): Promise<void> => {
    if (!files) return
    for (const file of Array.from(files)) {
      if (file.type === 'application/pdf') {
        const id = Date.now() + Math.random()
        const buffer = await file.arrayBuffer()
        processPdf(file, buffer, id)
      } else if (file.type.startsWith('image/')) {
        processImage(file)
      }
    }
  }

  const handleDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    handleFileSelect(e.dataTransfer.files)
  }

  const handleRemove = (id: number): void => {
    setResults((prev) => prev.filter((r) => r.id !== id))
  }

  return (
    <div>
      <h1 className="page-title">OCR 测试</h1>

      <div
        className="card"
        style={{ textAlign: 'center', cursor: 'pointer', padding: '40px 20px' }}
        onClick={() => fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => handleFileSelect(e.target.files)}
        />
        <div style={{ fontSize: '40px', marginBottom: '12px' }}>📄</div>
        <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>
          点击或拖拽图片 / PDF 到此处
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          支持 PNG、JPG、BMP 等图片格式，以及 PDF 文件
        </div>
      </div>

      {results.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          暂无识别结果，请添加图片或PDF开始测试
        </div>
      )}

      {results.map((r) => (
        <div key={r.id} className="card">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px'
            }}
          >
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>
              {r.type === 'pdf' ? `PDF: ${r.fileName}` : '识别结果'}
            </span>
            <button className="btn btn-danger" onClick={() => handleRemove(r.id)}>
              移除
            </button>
          </div>

          {r.type === 'pdf' && r.pageMethods && r.pageMethods.length > 0 && (
            <div style={{ marginBottom: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {r.pageMethods.map((pm) => (
                <span
                  key={pm.pageNum}
                  style={{
                    padding: '2px 10px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: 500,
                    background: pm.method === 'text' ? 'var(--primary)' : 'var(--warning)',
                    color: '#fff'
                  }}
                >
                  第{pm.pageNum}页 {pm.method === 'text' ? '文本提取' : 'OCR识别'}
                </span>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            {r.type === 'image' && r.imageUrl && (
              <div style={{ flex: '0 0 280px' }}>
                <img
                  src={r.imageUrl}
                  alt="ocr input"
                  style={{
                    maxWidth: '100%',
                    borderRadius: '8px',
                    border: '1px solid var(--border)'
                  }}
                />
              </div>
            )}
            <div style={{ flex: 1, minWidth: '200px' }}>
              {r.loading && (
                <div style={{ color: 'var(--primary)', fontSize: '13px' }}>识别中...</div>
              )}
              {r.error && (
                <div style={{ color: 'var(--danger)', fontSize: '13px' }}>错误: {r.error}</div>
              )}
              {!r.loading && !r.error && (
                <textarea
                  readOnly
                  value={r.text}
                  style={{
                    width: '100%',
                    minHeight: '160px',
                    padding: '10px',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontFamily: 'monospace',
                    resize: 'vertical',
                    background: 'var(--bg)',
                    userSelect: 'text'
                  }}
                />
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
