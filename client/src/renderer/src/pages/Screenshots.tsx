import React, { useEffect, useMemo, useState } from 'react'

type ViewMode = 'active' | 'trash'

interface ScreenshotRun {
  id: string
  startedAt: string
  flowName?: string
  sourceUrl?: string
  sourceTitle?: string
}

interface ScreenshotTag {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

interface ScreenshotItem {
  id: string
  filename: string
  status: ViewMode
  runId: string
  createdAt: string
  size: number
  deletedAt?: string
  tagIds: string[]
  run?: ScreenshotRun
  tags: ScreenshotTag[]
  thumbnailDataUrl: string
}

interface ScreenshotListResult {
  screenshots: ScreenshotItem[]
  tags: ScreenshotTag[]
  screenshotDir: string
  trashDir: string
}

interface ScreenshotImageResult {
  id: string
  filename: string
  dataUrl: string
}

interface ScreenshotsProps {
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}

function formatDate(value: string): string {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-CN')
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function getRunName(item: ScreenshotItem): string {
  return item.run?.flowName || '历史截图/未知执行'
}

export default function Screenshots({ showToast }: ScreenshotsProps): React.JSX.Element {
  const [data, setData] = useState<ScreenshotListResult>({
    screenshots: [],
    tags: [],
    screenshotDir: '',
    trashDir: ''
  })
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('active')
  const [tagFilter, setTagFilter] = useState('all')
  const [newTagById, setNewTagById] = useState<Record<string, string>>({})
  const [preview, setPreview] = useState<ScreenshotImageResult | null>(null)

  const loadData = async (): Promise<void> => {
    setLoading(true)
    try {
      setData(await window.api.listScreenshots())
    } catch {
      showToast('截图列表加载失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
    const unsub = window.api.onScreenshotsUpdated(() => {
      void loadData()
    })
    return unsub
  }, [])

  const filteredScreenshots = useMemo(() => {
    return data.screenshots.filter((item) => {
      if (item.status !== viewMode) return false
      if (tagFilter !== 'all' && !item.tagIds.includes(tagFilter)) return false
      return true
    })
  }, [data.screenshots, tagFilter, viewMode])

  const openPreview = async (id: string): Promise<void> => {
    const image = await window.api.getScreenshotImage(id)
    if (!image) {
      showToast('图片文件不存在', 'error')
      await loadData()
      return
    }
    setPreview(image)
  }

  const addExistingTag = async (item: ScreenshotItem, tagId: string): Promise<void> => {
    if (!tagId || item.tagIds.includes(tagId)) return
    await window.api.updateScreenshotTags(item.id, [...item.tagIds, tagId])
    await loadData()
  }

  const addNewTag = async (item: ScreenshotItem): Promise<void> => {
    const value = (newTagById[item.id] || '').trim()
    if (!value) return

    try {
      const tag = await window.api.createScreenshotTag(value)
      await addExistingTag(item, tag.id)
      setNewTagById((prev) => ({ ...prev, [item.id]: '' }))
    } catch {
      showToast('标签保存失败', 'error')
    }
  }

  const removeTag = async (item: ScreenshotItem, tagId: string): Promise<void> => {
    await window.api.updateScreenshotTags(item.id, item.tagIds.filter((id) => id !== tagId))
    await loadData()
  }

  const moveToTrash = async (item: ScreenshotItem): Promise<void> => {
    if (!window.confirm(`移入回收站：${item.filename}？`)) return
    await window.api.trashScreenshot(item.id)
    showToast('已移入回收站', 'success')
    await loadData()
  }

  const restore = async (item: ScreenshotItem): Promise<void> => {
    await window.api.restoreScreenshot(item.id)
    showToast('已恢复', 'success')
    await loadData()
  }

  const deleteForever = async (item: ScreenshotItem): Promise<void> => {
    if (!window.confirm(`永久删除：${item.filename}？此操作不可撤销。`)) return
    await window.api.deleteScreenshotPermanently(item.id)
    showToast('已永久删除', 'success')
    await loadData()
  }

  return (
    <>
      <div className="page-title">截图</div>

      <div className="screenshot-toolbar">
        <div className="segmented">
          <button
            className={viewMode === 'active' ? 'active' : ''}
            onClick={() => setViewMode('active')}
          >
            全部
          </button>
          <button
            className={viewMode === 'trash' ? 'active' : ''}
            onClick={() => setViewMode('trash')}
          >
            回收站
          </button>
        </div>

        <select
          className="form-select screenshot-filter"
          value={tagFilter}
          onChange={(event) => setTagFilter(event.target.value)}
        >
          <option value="all">全部标签</option>
          {data.tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>

        <button className="btn btn-secondary" onClick={loadData} disabled={loading}>
          刷新
        </button>
      </div>

      <div className="path-hint screenshot-path">
        {viewMode === 'trash' ? data.trashDir : data.screenshotDir || '截图目录尚未初始化'}
      </div>

      {loading ? (
        <div className="empty-tip">加载中...</div>
      ) : filteredScreenshots.length === 0 ? (
        <div className="empty-tip">
          {viewMode === 'trash' ? '回收站为空' : '还没有截图'}
        </div>
      ) : (
        <div className="screenshot-grid">
          {filteredScreenshots.map((item) => (
            <div key={item.id} className="screenshot-card">
              <button className="screenshot-thumb" onClick={() => openPreview(item.id)}>
                <img src={item.thumbnailDataUrl} alt={item.filename} />
              </button>

              <div className="screenshot-meta">
                <div className="screenshot-name" title={item.filename}>
                  {item.filename}
                </div>
                <div className="screenshot-sub">{getRunName(item)}</div>
                <div className="screenshot-sub">{formatDate(item.createdAt)} · {formatSize(item.size)}</div>
                {item.run?.sourceTitle && (
                  <div className="screenshot-sub" title={item.run.sourceUrl}>
                    {item.run.sourceTitle}
                  </div>
                )}
              </div>

              <div className="tag-row">
                {item.tags.length === 0 && <span className="tag-empty">无标签</span>}
                {item.tags.map((tag) => (
                  <button
                    key={tag.id}
                    className="tag-pill"
                    onClick={() => removeTag(item, tag.id)}
                    title="移除标签"
                  >
                    {tag.name} ×
                  </button>
                ))}
              </div>

              <div className="tag-edit-row">
                <select
                  className="form-select"
                  value=""
                  onChange={(event) => addExistingTag(item, event.target.value)}
                >
                  <option value="">选择标签</option>
                  {data.tags
                    .filter((tag) => !item.tagIds.includes(tag.id))
                    .map((tag) => (
                      <option key={tag.id} value={tag.id}>
                        {tag.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className="tag-edit-row">
                <input
                  className="form-input"
                  value={newTagById[item.id] || ''}
                  onChange={(event) =>
                    setNewTagById((prev) => ({ ...prev, [item.id]: event.target.value }))
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void addNewTag(item)
                  }}
                  placeholder="新标签"
                />
                <button className="btn btn-secondary btn-sm" onClick={() => addNewTag(item)}>
                  添加
                </button>
              </div>

              <div className="screenshot-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => window.api.openScreenshotInExplorer(item.id)}>
                  位置
                </button>
                {viewMode === 'active' ? (
                  <button className="btn btn-danger btn-sm" onClick={() => moveToTrash(item)}>
                    删除
                  </button>
                ) : (
                  <>
                    <button className="btn btn-secondary btn-sm" onClick={() => restore(item)}>
                      恢复
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => deleteForever(item)}>
                      永久删除
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {preview && (
        <div className="screenshot-lightbox" onClick={() => setPreview(null)}>
          <button className="screenshot-lightbox-close" onClick={() => setPreview(null)}>
            ×
          </button>
          <img
            src={preview.dataUrl}
            alt={preview.filename}
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}
