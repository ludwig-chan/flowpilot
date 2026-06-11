import { app } from 'electron'
import { randomUUID } from 'crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'fs'
import { join } from 'path'

// ─── 数据记录类型 ──────────────────────────────────────────────────────────────

export type DataRecordStatus = 'active' | 'trash'

export interface DataRecordTag {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface DataRecordItem {
  id: string
  createdAt: string
  fields: Record<string, string>
  fieldAliases?: Record<string, string>  // 变量别名映射（内部名→别名），用于友好显示
  status: DataRecordStatus
  tagIds: string[]
  deletedAt?: string
  runId?: string
  runStartedAt?: string
  flowId?: string
  flowName?: string
  sourceUrl?: string
  sourceTitle?: string
}

export interface DataRecordLibrary {
  schemaVersion: 2
  records: DataRecordItem[]
  tags: DataRecordTag[]
}

export interface DataRecordSaveMetadata {
  runId?: string
  runStartedAt?: string
  flowId?: string
  flowName?: string
  sourceUrl?: string
  sourceTitle?: string
  fieldAliases?: Record<string, string>
}

export interface DataRecordViewItem extends DataRecordItem {
  tags: DataRecordTag[]
}

export interface DataRecordListResult {
  records: DataRecordViewItem[]
  tags: DataRecordTag[]
}

// ─── 存储 ──────────────────────────────────────────────────────────────────────

const DATA_DIR = join(app.getPath('userData'), 'data')
const LIBRARY_FILE = join(DATA_DIR, 'data-record-library.json')

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
  mkdirSync(DATA_DIR, { recursive: true })
}

function emptyLibrary(): DataRecordLibrary {
  return { schemaVersion: 2, records: [], tags: [] }
}

function normalizeStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, String(v ?? '')])
  )
}

function loadLibrary(): DataRecordLibrary {
  ensureDirs()
  if (!existsSync(LIBRARY_FILE)) return emptyLibrary()

  try {
    const raw = JSON.parse(readFileSync(LIBRARY_FILE, 'utf-8')) as Record<string, unknown>

    // 兼容旧记录：自动补 status / tagIds
    const rawRecords = Array.isArray(raw.records) ? raw.records as Record<string, unknown>[] : []
    const records: DataRecordItem[] = rawRecords.map((r) => ({
      id:          String(r.id ?? ''),
      createdAt:   String(r.createdAt ?? ''),
      fields:      normalizeStringRecord(r.fields) ?? {},
      fieldAliases: normalizeStringRecord(r.fieldAliases),
      status:      (r.status === 'active' || r.status === 'trash') ? r.status : 'active',
      tagIds:      Array.isArray(r.tagIds) ? r.tagIds.filter((t): t is string => typeof t === 'string') : [],
      deletedAt:   typeof r.deletedAt === 'string' ? r.deletedAt : undefined,
      runId:       typeof r.runId === 'string' ? r.runId : undefined,
      runStartedAt: typeof r.runStartedAt === 'string' ? r.runStartedAt : undefined,
      flowId:      typeof r.flowId === 'string' ? r.flowId : undefined,
      flowName:    typeof r.flowName === 'string' ? r.flowName : undefined,
      sourceUrl:   typeof r.sourceUrl === 'string' ? r.sourceUrl : undefined,
      sourceTitle: typeof r.sourceTitle === 'string' ? r.sourceTitle : undefined,
    }))

    const rawTags = Array.isArray(raw.tags) ? raw.tags as Record<string, unknown>[] : []
    const tags: DataRecordTag[] = rawTags
      .map((t) => ({
        id:        String(t.id ?? ''),
        name:      String(t.name ?? ''),
        createdAt: String(t.createdAt ?? ''),
        updatedAt: String(t.updatedAt ?? t.createdAt ?? ''),
      }))
      .filter((t) => t.id && t.name)

    return { schemaVersion: 2, records, tags }
  } catch {
    return emptyLibrary()
  }
}

function saveLibrary(library: DataRecordLibrary): void {
  ensureDirs()
  writeFileSync(LIBRARY_FILE, JSON.stringify(library, null, 2), 'utf-8')
}

// ─── 公开 API ──────────────────────────────────────────────────────────────────

/** 保存一条数据记录（由 HTTP bridge 调用） */
export function recordDataRecord(
  fields: Record<string, string>,
  metadata: DataRecordSaveMetadata = {}
): DataRecordItem {
  const library = loadLibrary()
  const item: DataRecordItem = {
    id: newId('dr'),
    createdAt: nowIso(),
    fields,
    fieldAliases: metadata.fieldAliases,
    status: 'active',
    tagIds: [],
    runId: metadata.runId,
    runStartedAt: metadata.runStartedAt,
    flowId: metadata.flowId,
    flowName: metadata.flowName,
    sourceUrl: metadata.sourceUrl,
    sourceTitle: metadata.sourceTitle,
  }
  library.records.push(item)
  saveLibrary(library)
  return item
}

/** 列出数据记录（active 和 trash 都在，前端按 status 过滤） */
export function listDataRecords(): DataRecordListResult {
  const library = loadLibrary()
  const tagsById = new Map(library.tags.map((tag) => [tag.id, tag]))

  const records: DataRecordViewItem[] = library.records
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((item) => ({
      ...item,
      tags: item.tagIds.map((id) => tagsById.get(id)).filter((tag): tag is DataRecordTag => !!tag),
    }))

  return {
    records,
    tags: library.tags.sort((a, b) => a.name.localeCompare(b.name)),
  }
}

/** 创建标签，重名返回已有 */
export function createDataRecordTag(name: string): DataRecordTag {
  const tagName = name.trim()
  if (!tagName) throw new Error('标签名不能为空')

  const library = loadLibrary()
  const existing = library.tags.find((tag) => tag.name.toLowerCase() === tagName.toLowerCase())
  if (existing) return existing

  const createdAt = nowIso()
  const tag: DataRecordTag = {
    id: newId('drtag'),
    name: tagName,
    createdAt,
    updatedAt: createdAt,
  }
  library.tags.push(tag)
  saveLibrary(library)
  return tag
}

/** 更新记录的标签关联 */
export function updateDataRecordTags(id: string, tagIds: string[]): DataRecordItem {
  const library = loadLibrary()
  const item = library.records.find((r) => r.id === id)
  if (!item) throw new Error('记录不存在')

  const validIds = new Set(library.tags.map((tag) => tag.id))
  item.tagIds = [...new Set(tagIds.filter((tagId) => validIds.has(tagId)))]
  saveLibrary(library)
  return item
}

/** 移入回收站（纯 JSON 操作，无文件） */
export function trashDataRecord(id: string): boolean {
  const library = loadLibrary()
  const item = library.records.find((r) => r.id === id)
  if (!item) throw new Error('记录不存在')
  if (item.status === 'trash') return true

  item.status = 'trash'
  item.deletedAt = nowIso()
  saveLibrary(library)
  return true
}

/** 从回收站恢复 */
export function restoreDataRecord(id: string): boolean {
  const library = loadLibrary()
  const item = library.records.find((r) => r.id === id)
  if (!item) throw new Error('记录不存在')
  if (item.status === 'active') return true

  item.status = 'active'
  delete item.deletedAt
  saveLibrary(library)
  return true
}

/** 永久删除（从数组中移除） */
export function deleteDataRecordPermanently(id: string): boolean {
  const library = loadLibrary()
  const index = library.records.findIndex((r) => r.id === id)
  if (index < 0) throw new Error('记录不存在')

  const item = library.records[index]
  if (item.status !== 'trash') throw new Error('只能永久删除回收站中的记录')

  library.records.splice(index, 1)
  saveLibrary(library)
  return true
}
