import React from 'react'

interface OcrTextDialogProps {
  text: string
  label: string
  onClose: () => void
}

export default function OcrTextDialog({ text, label, onClose }: OcrTextDialogProps): React.JSX.Element {
  return (
    <div className="ocr-dialog-overlay" onClick={onClose}>
      <div className="ocr-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="ocr-dialog-header">
          <span>OCR 识别结果 — {label}</span>
          <button className="ocr-dialog-close" onClick={onClose}>×</button>
        </div>
        <div className="ocr-dialog-body ocr-dialog-body-selectable">{text}</div>
      </div>
    </div>
  )
}