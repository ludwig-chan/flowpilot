import { app, shell } from 'electron'
import { randomUUID } from 'crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'fs'
import { basename, extname, join, parse } from 'path'
import { getEffectiveScreenshotDir, loadConfig } from './config'

export type ScreenshotStatus = 'active' | 'trash'

export interface ScreenshotRun {
  id: string
  startedAt: string
  flowId?: string
  flowName?: string
  sourceUrl?: string
  sourceTitle?: string
}

export interface ScreenshotTag {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface ScreenshotItem {
  id: string
  filename: string
  relativePath: string
  status: ScreenshotStatus
  runId: string
  createdAt: string
  size: number
  tagIds: string[]
  deletedAt?: string
}

export interface ScreenshotLibrary {
  schemaVersion: 1
  screenshots: ScreenshotItem[]
  runs: ScreenshotRun[]
  tags: ScreenshotTag[]
}

export interface ScreenshotSaveMetadata {
  runId?: string
  runStartedAt?: string
  flowId?: string
  flowName?: string
  sourceUrl?: string
  sourceTitle?: string
}

export interface ScreenshotViewItem extends ScreenshotItem {
  run?: ScreenshotRun
  tags: ScreenshotTag[]
  thumbnailDataUrl: string
}

export interface ScreenshotListResult {
  screenshots: ScreenshotViewItem[]
  runs: ScreenshotRun[]
  tags: ScreenshotTag[]
  screenshotDir: string
  trashDir: string
}

const LEGACY_RUN_ID = 'legacy'
const DATA_DIR = join(app.getPath('userData'), 'data')
const LIBRARY_FILE = join(DATA_DIR, 'screenshot-library.json')
const TRASH_DIR = join(DATA_DIR, 'screenshots-trash')

function nowIso(): string {
  return new Date().toISOString()
}

function newId(prefix: string): string {
  return `${prefix}_${randomUUID()}`
}

export function getScreenshotDir(): string {
  return getEffectiveScreenshotDir(loadConfig().screenshotDir)
}

export function getScreenshotTrashDir(): string {
  return TRASH_DIR
}

function ensureDirs(): void {
  mkdirSync(DATA_DIR, { recursive: true })
  mkdirSync(getScreenshotDir(), { recursive: true })
  mkdirSync(TRASH_DIR, { recursive: true })
}

function emptyLibrary(): ScreenshotLibrary {
  return {
    schemaVersion: 1,
    screenshots: [],
    runs: [],
    tags: []
  }
}

function loadLibrary(): ScreenshotLibrary {
  ensureDirs()
  if (!existsSync(LIBRARY_FILE)) return emptyLibrary()

  try {
    const parsed = JSON.parse(readFileSync(LIBRARY_FILE, 'utf-8')) as Partial<ScreenshotLibrary>
    return {
      schemaVersion: 1,
      screenshots: Array.isArray(parsed.screenshots) ? parsed.screenshots : [],
      runs: Array.isArray(parsed.runs) ? parsed.runs : [],
      tags: Array.isArray(parsed.tags) ? parsed.tags : []
    }
  } catch {
    return emptyLibrary()
  }
}

function saveLibrary(library: ScreenshotLibrary): void {
  ensureDirs()
  writeFileSync(LIBRARY_FILE, JSON.stringify(library, null, 2), 'utf-8')
}

function getLegacyRun(): ScreenshotRun {
  return {
    id: LEGACY_RUN_ID,
    startedAt: '1970-01-01T00:00:00.000Z',
    flowName: '历史截图/未知执行'
  }
}

function ensureLegacyRun(library: ScreenshotLibrary): void {
  if (!library.runs.some((run) => run.id === LEGACY_RUN_ID)) {
    library.runs.push(getLegacyRun())
  }
}

function relativePathFor(status: ScreenshotStatus, filename: string): string {
  return `${status === 'trash' ? 'screenshots-trash' : 'screenshots'}/${filename}`
}

function getFilePath(item: ScreenshotItem): string {
  return join(item.status === 'trash' ? TRASH_DIR : getScreenshotDir(), item.filename)
}

export function getScreenshotFilePath(id: string): string | null {
  const library = syncLibrary()
  const item = library.screenshots.find((screenshot) => screenshot.id === id)
  if (!item) return null
  return getFilePath(item)
}

export function createUniqueScreenshotPath(filename: string): { filename: string; filePath: string } {
  ensureDirs()
  const safeFilename = basename(filename || 'screenshot.png').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
  const parsed = parse(safeFilename || 'screenshot.png')
  const ext = parsed.ext || '.png'
  const base = parsed.name || 'screenshot'
  let nextFilename = `${base}${ext}`
  let filePath = join(getScreenshotDir(), nextFilename)
  let index = 1

  while (existsSync(filePath)) {
    nextFilename = `${base}-${index}${ext}`
    filePath = join(getScreenshotDir(), nextFilename)
    index += 1
  }

  return { filename: nextFilename, filePath }
}

function createUniqueTrashPath(filename: string): { filename: string; filePath: string } {
  ensureDirs()
  const parsed = parse(filename)
  const ext = parsed.ext || '.png'
  const base = parsed.name || 'screenshot'
  let nextFilename = `${base}${ext}`
  let filePath = join(TRASH_DIR, nextFilename)
  let index = 1

  while (existsSync(filePath)) {
    nextFilename = `${base}-${index}${ext}`
    filePath = join(TRASH_DIR, nextFilename)
    index += 1
  }

  return { filename: nextFilename, filePath }
}

function syncLegacyFiles(library: ScreenshotLibrary): boolean {
  ensureLegacyRun(library)

  const screenshotDir = getScreenshotDir()
  if (!existsSync(screenshotDir)) return false

  const knownFilenames = new Set(
    library.screenshots
      .filter((screenshot) => screenshot.status === 'active')
      .map((screenshot) => screenshot.filename)
  )
  let changed = false

  for (const filename of readdirSync(screenshotDir)) {
    if (extname(filename).toLowerCase() !== '.png') continue
    if (knownFilenames.has(filename)) continue

    const filePath = join(screenshotDir, filename)
    const stat = statSync(filePath)
    if (!stat.isFile()) continue

    library.screenshots.push({
      id: newId('shot'),
      filename,
      relativePath: relativePathFor('active', filename),
      status: 'active',
      runId: LEGACY_RUN_ID,
      createdAt: stat.birthtime.toISOString(),
      size: stat.size,
      tagIds: []
    })
    changed = true
  }

  return changed
}

function syncLibrary(): ScreenshotLibrary {
  const library = loadLibrary()
  if (syncLegacyFiles(library)) saveLibrary(library)
  return library
}

function readImageDataUrl(filePath: string): string {
  if (!existsSync(filePath)) return ''
  return `data:image/png;base64,${readFileSync(filePath).toString('base64')}`
}

function getRun(library: ScreenshotLibrary, metadata: ScreenshotSaveMetadata, createdAt: string): ScreenshotRun {
  const runId = metadata.runId?.trim() || newId('run')
  let run = library.runs.find((item) => item.id === runId)

  if (!run) {
    run = {
      id: runId,
      startedAt: metadata.runStartedAt || createdAt,
      flowId: metadata.flowId,
      flowName: metadata.flowName || '未命名执行',
      sourceUrl: metadata.sourceUrl,
      sourceTitle: metadata.sourceTitle
    }
    library.runs.push(run)
  } else {
    run.flowId = run.flowId || metadata.flowId
    run.flowName = run.flowName || metadata.flowName
    run.sourceUrl = run.sourceUrl || metadata.sourceUrl
    run.sourceTitle = run.sourceTitle || metadata.sourceTitle
  }

  return run
}

export function recordScreenshot(
  filePath: string,
  filename: string,
  metadata: ScreenshotSaveMetadata = {}
): ScreenshotItem {
  const library = loadLibrary()
  const createdAt = nowIso()
  const run = getRun(library, metadata, createdAt)
  const size = statSync(filePath).size
  const item: ScreenshotItem = {
    id: newId('shot'),
    filename,
    relativePath: relativePathFor('active', filename),
    status: 'active',
    runId: run.id,
    createdAt,
    size,
    tagIds: []
  }

  library.screenshots.push(item)
  saveLibrary(library)
  return item
}

export function listScreenshots(): ScreenshotListResult {
  const library = syncLibrary()
  const runsById = new Map(library.runs.map((run) => [run.id, run]))
  const tagsById = new Map(library.tags.map((tag) => [tag.id, tag]))
  const screenshots = library.screenshots
    .filter((item) => existsSync(getFilePath(item)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((item) => ({
      ...item,
      run: runsById.get(item.runId),
      tags: item.tagIds.map((id) => tagsById.get(id)).filter((tag): tag is ScreenshotTag => !!tag),
      thumbnailDataUrl: readImageDataUrl(getFilePath(item))
    }))

  return {
    screenshots,
    runs: library.runs,
    tags: library.tags.sort((a, b) => a.name.localeCompare(b.name)),
    screenshotDir: getScreenshotDir(),
    trashDir: TRASH_DIR
  }
}

export function getScreenshotImage(id: string): { id: string; filename: string; dataUrl: string } | null {
  const library = syncLibrary()
  const item = library.screenshots.find((screenshot) => screenshot.id === id)
  if (!item) return null

  const filePath = getFilePath(item)
  if (!existsSync(filePath)) return null

  return {
    id,
    filename: item.filename,
    dataUrl: readImageDataUrl(filePath)
  }
}

export function createScreenshotTag(name: string): ScreenshotTag {
  const tagName = name.trim()
  if (!tagName) throw new Error('Tag name is required')

  const library = syncLibrary()
  const existing = library.tags.find((tag) => tag.name.toLowerCase() === tagName.toLowerCase())
  if (existing) return existing

  const createdAt = nowIso()
  const tag: ScreenshotTag = {
    id: newId('tag'),
    name: tagName,
    createdAt,
    updatedAt: createdAt
  }

  library.tags.push(tag)
  saveLibrary(library)
  return tag
}

export function updateScreenshotTags(id: string, tagIds: string[]): ScreenshotItem {
  const library = syncLibrary()
  const item = library.screenshots.find((screenshot) => screenshot.id === id)
  if (!item) throw new Error('Screenshot not found')

  const validIds = new Set(library.tags.map((tag) => tag.id))
  item.tagIds = [...new Set(tagIds.filter((tagId) => validIds.has(tagId)))]
  saveLibrary(library)
  return item
}

export function trashScreenshot(id: string): boolean {
  const library = syncLibrary()
  const item = library.screenshots.find((screenshot) => screenshot.id === id)
  if (!item) throw new Error('Screenshot not found')
  if (item.status === 'trash') return true

  const sourcePath = getFilePath(item)
  if (!existsSync(sourcePath)) throw new Error('Screenshot file not found')

  const target = createUniqueTrashPath(item.filename)
  renameSync(sourcePath, target.filePath)
  item.filename = target.filename
  item.relativePath = relativePathFor('trash', target.filename)
  item.status = 'trash'
  item.deletedAt = nowIso()
  saveLibrary(library)
  return true
}

export function restoreScreenshot(id: string): boolean {
  const library = syncLibrary()
  const item = library.screenshots.find((screenshot) => screenshot.id === id)
  if (!item) throw new Error('Screenshot not found')
  if (item.status === 'active') return true

  const sourcePath = getFilePath(item)
  if (!existsSync(sourcePath)) throw new Error('Screenshot file not found')

  const target = createUniqueScreenshotPath(item.filename)
  renameSync(sourcePath, target.filePath)
  item.filename = target.filename
  item.relativePath = relativePathFor('active', target.filename)
  item.status = 'active'
  delete item.deletedAt
  saveLibrary(library)
  return true
}

export function deleteScreenshotPermanently(id: string): boolean {
  const library = syncLibrary()
  const index = library.screenshots.findIndex((screenshot) => screenshot.id === id)
  if (index < 0) throw new Error('Screenshot not found')

  const item = library.screenshots[index]
  if (item.status !== 'trash') throw new Error('Only trash screenshots can be deleted permanently')

  const filePath = getFilePath(item)
  if (existsSync(filePath)) rmSync(filePath, { force: true })
  library.screenshots.splice(index, 1)
  saveLibrary(library)
  return true
}

export function openScreenshotInExplorer(id: string): boolean {
  const filePath = getScreenshotFilePath(id)
  if (!filePath || !existsSync(filePath)) return false
  shell.showItemInFolder(filePath)
  return true
}
