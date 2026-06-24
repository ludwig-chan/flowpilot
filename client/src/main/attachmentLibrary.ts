import { app } from 'electron'
import { randomUUID } from 'crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  renameSync,
  unlinkSync,
  statSync
} from 'fs'
import { join, extname } from 'path'

// ─── 附件类型 ──────────────────────────────────────────────────────────────────

export type AttachmentStatus = 'active' | 'trash'

export interface AttachmentItem {
  id: string
  filename: string
  storedFilename: string  // 存储时的文件名（id + 原始扩展名）
  filePath: string        // 相对于附件目录的路径
  fileSize: number
  mimeType?: string
  createdAt: string
  status: AttachmentStatus
  deletedAt?: string
  runId?: string
  runStartedAt?: string
  flowId?: string
  flowName?: string
  sourceUrl?: string
  ocrStatus?: 'pending' | 'processing' | 'done' | 'failed'
  ocrText?: string
  ocrAt?: string
}

export interface AttachmentLibrary {
  schemaVersion: 1
  attachments: AttachmentItem[]
}

export interface AttachmentSaveMetadata {
  runId?: string
  runStartedAt?: string
  flowId?: string
  flowName?: string
  sourceUrl?: string
}

// ─── 存储 ──────────────────────────────────────────────────────────────────────

const DATA_DIR = join(app.getPath('userData'), 'data')
const ATTACHMENTS_DIR = join(DATA_DIR, 'attachments')
const ATTACHMENTS_TRASH_DIR = join(DATA_DIR, 'attachments-trash')
const LIBRARY_FILE = join(DATA_DIR, 'attachment-library.json')

const pad2 = (n: number) => String(n).padStart(2, '0')

function formatLocalTime(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

function nowIso(): string {
  return formatLocalTime(new Date())
}

function newId(prefix: string): string {
  return `${prefix}_${randomUUID()}`
}

function ensureDirs(): void {
  mkdirSync(ATTACHMENTS_DIR, { recursive: true })
  mkdirSync(ATTACHMENTS_TRASH_DIR, { recursive: true })
}

function emptyLibrary(): AttachmentLibrary {
  return { schemaVersion: 1, attachments: [] }
}

function loadLibrary(): AttachmentLibrary {
  ensureDirs()
  if (!existsSync(LIBRARY_FILE)) return emptyLibrary()

  try {
    const raw = JSON.parse(readFileSync(LIBRARY_FILE, 'utf-8')) as Record<string, unknown>
    const rawAttachments = Array.isArray(raw.attachments) ? raw.attachments as Record<string, unknown>[] : []
    const attachments: AttachmentItem[] = rawAttachments.map((a) => ({
      id:           String(a.id ?? ''),
      filename:     String(a.filename ?? ''),
      storedFilename: String(a.storedFilename ?? ''),
      filePath:     String(a.filePath ?? ''),
      fileSize:     Number(a.fileSize ?? 0),
      mimeType:     typeof a.mimeType === 'string' ? a.mimeType : undefined,
      createdAt:    String(a.createdAt ?? ''),
      status:       (a.status === 'active' || a.status === 'trash') ? a.status : 'active',
      deletedAt:    typeof a.deletedAt === 'string' ? a.deletedAt : undefined,
      runId:        typeof a.runId === 'string' ? a.runId : undefined,
      runStartedAt: typeof a.runStartedAt === 'string' ? a.runStartedAt : undefined,
      flowId:       typeof a.flowId === 'string' ? a.flowId : undefined,
      flowName:     typeof a.flowName === 'string' ? a.flowName : undefined,
      sourceUrl:    typeof a.sourceUrl === 'string' ? a.sourceUrl : undefined,
      ocrStatus:    (a.ocrStatus === 'pending' || a.ocrStatus === 'processing' || a.ocrStatus === 'done' || a.ocrStatus === 'failed') ? a.ocrStatus : undefined,
      ocrText:      typeof a.ocrText === 'string' ? a.ocrText : undefined,
      ocrAt:        typeof a.ocrAt === 'string' ? a.ocrAt : undefined,
    }))
    return { schemaVersion: 1, attachments }
  } catch {
    return emptyLibrary()
  }
}

function saveLibrary(library: AttachmentLibrary): void {
  ensureDirs()
  writeFileSync(LIBRARY_FILE, JSON.stringify(library, null, 2), 'utf-8')
}

// ─── 公开 API ──────────────────────────────────────────────────────────────────

/**
 * 保存附件（由 HTTP bridge 调用）
 * @param sourcePath 源文件路径（浏览器下载目录中的文件）
 * @param mode 'capture' = 移动文件（不保留原始），'keep_and_capture' = 复制文件（保留原始）
 */
export function recordAttachment(
  sourcePath: string,
  originalFilename: string,
  mode: 'capture' | 'keep_and_capture',
  metadata: AttachmentSaveMetadata = {}
): AttachmentItem {
  ensureDirs()

  if (!existsSync(sourcePath)) {
    throw new Error(`源文件不存在: ${sourcePath}`)
  }

  const id = newId('att')
  const ext = extname(originalFilename)
  const storedFilename = `${id}${ext}`
  const destPath = join(ATTACHMENTS_DIR, storedFilename)

  // 根据模式决定移动还是复制
  if (mode === 'capture') {
    // 移动文件（原子操作，同盘符时）
    renameSync(sourcePath, destPath)
  } else {
    // 复制文件（保留原始）
    copyFileSync(sourcePath, destPath)
  }

  const stat = statSync(destPath)

  const library = loadLibrary()
  const item: AttachmentItem = {
    id,
    filename: originalFilename,
    storedFilename,
    filePath: storedFilename,
    fileSize: stat.size,
    createdAt: nowIso(),
    status: 'active',
    runId: metadata.runId,
    runStartedAt: metadata.runStartedAt,
    flowId: metadata.flowId,
    flowName: metadata.flowName,
    sourceUrl: metadata.sourceUrl,
  }
  library.attachments.push(item)
  saveLibrary(library)
  return item
}

/** 列出所有附件 */
export function listAttachments(): AttachmentItem[] {
  const library = loadLibrary()
  return library.attachments.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** 按 runId 查询附件 */
export function listAttachmentsByRunId(runId: string): AttachmentItem[] {
  const library = loadLibrary()
  return library.attachments
    .filter((a) => a.runId === runId && a.status === 'active')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** 获取附件完整路径 */
export function getAttachmentPath(id: string): string | null {
  const library = loadLibrary()
  const item = library.attachments.find((a) => a.id === id)
  if (!item) return null
  return join(ATTACHMENTS_DIR, item.filePath)
}

/** 获取附件文件内容（base64） */
export function getAttachmentFile(id: string): { id: string; filename: string; dataUrl: string } | null {
  const library = loadLibrary()
  const item = library.attachments.find((a) => a.id === id)
  if (!item) return null

  const fullPath = join(ATTACHMENTS_DIR, item.filePath)
  if (!existsSync(fullPath)) return null

  const buffer = readFileSync(fullPath)
  const base64 = buffer.toString('base64')
  const ext = extname(item.filename).toLowerCase()
  const mimeMap: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.json': 'application/json',
    '.zip': 'application/zip',
  }
  const mimeType = mimeMap[ext] || 'application/octet-stream'
  const dataUrl = `data:${mimeType};base64,${base64}`

  return { id: item.id, filename: item.filename, dataUrl }
}

/** 移入回收站 */
export function trashAttachment(id: string): boolean {
  const library = loadLibrary()
  const item = library.attachments.find((a) => a.id === id)
  if (!item) throw new Error('附件不存在')
  if (item.status === 'trash') return true

  // 移动文件到回收站目录
  const srcPath = join(ATTACHMENTS_DIR, item.filePath)
  const destPath = join(ATTACHMENTS_TRASH_DIR, item.storedFilename)
  if (existsSync(srcPath)) {
    renameSync(srcPath, destPath)
  }

  item.status = 'trash'
  item.deletedAt = nowIso()
  saveLibrary(library)
  return true
}

/** 从回收站恢复 */
export function restoreAttachment(id: string): boolean {
  const library = loadLibrary()
  const item = library.attachments.find((a) => a.id === id)
  if (!item) throw new Error('附件不存在')
  if (item.status === 'active') return true

  // 移动文件回附件目录
  const srcPath = join(ATTACHMENTS_TRASH_DIR, item.storedFilename)
  const destPath = join(ATTACHMENTS_DIR, item.filePath)
  if (existsSync(srcPath)) {
    renameSync(srcPath, destPath)
  }

  item.status = 'active'
  delete item.deletedAt
  saveLibrary(library)
  return true
}

/** 永久删除 */
export function deleteAttachmentPermanently(id: string): boolean {
  const library = loadLibrary()
  const index = library.attachments.findIndex((a) => a.id === id)
  if (index < 0) throw new Error('附件不存在')

  const item = library.attachments[index]
  if (item.status !== 'trash') throw new Error('只能永久删除回收站中的附件')

  // 删除文件
  const trashPath = join(ATTACHMENTS_TRASH_DIR, item.storedFilename)
  if (existsSync(trashPath)) {
    unlinkSync(trashPath)
  }

  library.attachments.splice(index, 1)
  saveLibrary(library)
  return true
}

/** 更新 OCR 结果 */
export function updateAttachmentOcr(id: string, ocrText: string): AttachmentItem {
  const library = loadLibrary()
  const item = library.attachments.find((a) => a.id === id)
  if (!item) throw new Error('附件不存在')

  item.ocrText = ocrText
  item.ocrStatus = 'done'
  item.ocrAt = nowIso()
  saveLibrary(library)
  return item
}

/** 更新 OCR 状态 */
export function updateAttachmentOcrStatus(id: string, status: 'pending' | 'processing' | 'done' | 'failed'): AttachmentItem {
  const library = loadLibrary()
  const item = library.attachments.find((a) => a.id === id)
  if (!item) throw new Error('附件不存在')

  item.ocrStatus = status
  saveLibrary(library)
  return item
}
