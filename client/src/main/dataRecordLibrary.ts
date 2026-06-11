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

export interface DataRecordItem {
  id: string
  createdAt: string
  fields: Record<string, string>
  runId?: string
  runStartedAt?: string
  flowId?: string
  flowName?: string
  sourceUrl?: string
  sourceTitle?: string
}

export interface DataRecordLibrary {
  schemaVersion: 1
  records: DataRecordItem[]
}

export interface DataRecordSaveMetadata {
  runId?: string
  runStartedAt?: string
  flowId?: string
  flowName?: string
  sourceUrl?: string
  sourceTitle?: string
}

// ─── 存储 ──────────────────────────────────────────────────────────────────────

const DATA_DIR = join(app.getPath('userData'), 'data')
const LIBRARY_FILE = join(DATA_DIR, 'data-record-library.json')

const pad2 = (n: number) => String(n).padStart(2, '0')

function formatLocalTime(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

function ensureDirs(): void {
  mkdirSync(DATA_DIR, { recursive: true })
}

function emptyLibrary(): DataRecordLibrary {
  return { schemaVersion: 1, records: [] }
}

function loadLibrary(): DataRecordLibrary {
  ensureDirs()
  if (!existsSync(LIBRARY_FILE)) return emptyLibrary()
  try {
    const parsed = JSON.parse(readFileSync(LIBRARY_FILE, 'utf-8')) as Partial<DataRecordLibrary>
    return {
      schemaVersion: 1,
      records: Array.isArray(parsed.records) ? parsed.records : []
    }
  } catch {
    return emptyLibrary()
  }
}

function saveLibrary(library: DataRecordLibrary): void {
  ensureDirs()
  writeFileSync(LIBRARY_FILE, JSON.stringify(library, null, 2), 'utf-8')
}

// ─── 公开 API ──────────────────────────────────────────────────────────────────

export function recordDataRecord(
  fields: Record<string, string>,
  metadata: DataRecordSaveMetadata = {}
): DataRecordItem {
  const library = loadLibrary()
  const item: DataRecordItem = {
    id: `dr_${randomUUID()}`,
    createdAt: formatLocalTime(new Date()),
    fields,
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