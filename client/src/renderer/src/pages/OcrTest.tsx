import React, { useState, useRef } from 'react'

interface OcrResult {
  id: number
  type: 'image'
  imageUrl?: string
  fileName?: string
  text: string
  loading: boolean
  error?: string
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

  const handleFileSelect = (files: FileList | null): void => {
    if (!files) return
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) {
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
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => handleFileSelect(e.target.files)}
        />
        <div style={{ fontSize: '40px', marginBottom: '12px' }}>📄</div>
        <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>
          点击或拖拽图片到此处
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          支持 PNG、JPG、BMP 等图片格式
        </div>
      </div>

      {results.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          暂无识别结果，请添加图片开始测试
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
              识别结果{r.fileName ? `: ${r.fileName}` : ''}
            </span>
            <button className="btn btn-danger" onClick={() => handleRemove(r.id)}>
              移除
            </button>
          </div>

          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            {r.imageUrl && (
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
