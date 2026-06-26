import React, { useEffect, useMemo, useState } from 'react'
import DataTable, { type Column } from '../components/DataTable'

interface AttachmentItem {
  id: string
  filename: string
  storedFilename: string
  filePath: string
  fileSize: number
  createdAt: string
  status: 'active' | 'trash'
  runId?: string
  runStartedAt?: string
  flowId?: string
  flowName?: string
  sourceUrl?: string
  ocrStatus?: 'pending' | 'processing' | 'done' | 'failed'
  ocrText?: string
  ocrAt?: string
}

interface CapturesProps {
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 2)} ${units[index]}`
}

function formatDate(value: string): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

function formatOcrStatus(status?: AttachmentItem['ocrStatus']): string {
  if (!status) return '-'
  const labelMap: Record<NonNullable<AttachmentItem['ocrStatus']>, string> = {
    pending: '等待中',
    processing: '识别中',
    done: '已完成',
    failed: '失败',
  }
  return labelMap[status]
}

function shortUrl(url?: string): string {
  if (!url) return '-'
  try {
    const parsed = new URL(url)
    return `${parsed.hostname}${parsed.pathname}`
  } catch {
    return url
  }
}

export default function Captures({ showToast }: CapturesProps): React.JSX.Element {
  const [attachments, setAttachments] = useState<AttachmentItem[]>([])
  const [loading, setLoading] = useState(true)

  const activeAttachments = useMemo(
    () => attachments.filter((item) => item.status === 'active'),
    [attachments],
  )

  const loadAttachments = async (): Promise<void> => {
    setLoading(true)
    try {
      setAttachments(await window.api.listAttachments())
    } catch (err) {
      showToast(`捕获列表加载失败：${(err as Error).message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAttachments()
    const unsubscribe = window.api.onAttachmentsUpdated(() => {
      void loadAttachments()
    })
    return unsubscribe
  }, [])

  const columns: Column<AttachmentItem>[] = [
    {
      key: 'filename',
      header: '文件名',
      width: '24%',
      render: (item) => (
        <div>
          <div className="screenshot-name" title={item.filename}>{item.filename}</div>
          <div className="screenshot-sub" title={item.id}>{item.id}</div>
        </div>
      ),
    },
    {
      key: 'fileSize',
      header: '大小',
      width: '90px',
      render: (item) => formatFileSize(item.fileSize),
    },
    {
      key: 'createdAt',
      header: '捕获时间',
      width: '160px',
      render: (item) => formatDate(item.createdAt),
    },
    {
      key: 'flow',
      header: '关联流程',
      width: '140px',
      render: (item) => item.flowName || item.flowId || '未关联',
    },
    {
      key: 'ocrStatus',
      header: 'OCR',
      width: '90px',
      render: (item) => formatOcrStatus(item.ocrStatus),
    },
    {
      key: 'sourceUrl',
      header: '来源 URL',
      render: (item) => (
        <span className="screenshot-sub" title={item.sourceUrl || ''}>
          {shortUrl(item.sourceUrl)}
        </span>
      ),
    },
  ]

  return (
    <div>
      <div className="page-title">捕获</div>

      <div className="card">
        <div className="screenshot-toolbar">
          <button className="btn btn-primary" onClick={loadAttachments} disabled={loading}>
            {loading ? '刷新中...' : '刷新'}
          </button>
          <span className="text-muted">
            共 {activeAttachments.length} 个捕获文件。当前页面用于验证全局下载捕获是否成功写入附件库。
          </span>
        </div>

        {loading ? (
          <div className="empty-tip">正在加载捕获列表...</div>
        ) : (
          <DataTable
            columns={columns}
            data={activeAttachments}
            rowKey={(item) => item.id}
            emptyText="暂无捕获文件。请确认客户端正在运行、扩展已重新加载，并尝试重新下载文件。"
          />
        )}
      </div>
    </div>
  )
}
