import type { FilterGroupData } from '../components/FilterGroup'
import type { TimeRange } from '../components/TimeRangeSelector'

export interface FilterCriteria {
  searchKeyword: string
  whitelistGroups: FilterGroupData[]
  blacklistGroups: FilterGroupData[]
  timeRange: TimeRange
  tagFilter?: string
}

interface FilterableRecord {
  createdAt: string
  fields: Record<string, string>
  status: 'active' | 'trash'
  tagIds: string[]
}

/** 构建记录的搜索文本：所有字段值 + OCR 文本 */
export function buildSearchText(
  record: FilterableRecord,
  ocrResults: Record<string, string>,
): string {
  const parts: string[] = []

  // 添加所有字段值
  for (const value of Object.values(record.fields)) {
    if (value) parts.push(value)
  }

  // 添加 OCR 文本（如果字段值是截图 ID 且有 OCR 结果）
  for (const value of Object.values(record.fields)) {
    if (value && value.startsWith('shot_') && !value.includes(' ') && ocrResults[value]) {
      parts.push(ocrResults[value])
    }
  }

  return parts.join(' ').toLowerCase()
}

/** 检查单个关键字组是否匹配 */
function matchKeywordGroup(searchText: string, group: FilterGroupData): boolean {
  if (group.keywords.length === 0) return true

  if (group.matchMode === 'AND') {
    // AND 模式：所有关键字都要包含
    return group.keywords.every((keyword) => searchText.includes(keyword.toLowerCase()))
  } else {
    // OR 模式：任一关键字包含即可
    return group.keywords.some((keyword) => searchText.includes(keyword.toLowerCase()))
  }
}

/** 检查快速搜索是否命中 */
function matchQuickSearch(searchText: string, keyword: string): boolean {
  if (!keyword.trim()) return true
  return searchText.includes(keyword.trim().toLowerCase())
}

/** 检查时间范围是否匹配 */
function matchTimeRange(recordDate: string, timeRange: TimeRange): boolean {
  if (!timeRange.start || !timeRange.end) return true

  // 将 "YYYY-MM-DD HH:mm" 转为 Date
  const parseDate = (str: string): Date => {
    const [datePart, timePart] = str.split(' ')
    if (!timePart) return new Date(str) // 兼容纯日期格式
    return new Date(`${datePart}T${timePart}`)
  }

  const recordTime = new Date(recordDate).getTime()
  const startTime = parseDate(timeRange.start).getTime()
  const endTime = parseDate(timeRange.end).getTime()

  return recordTime >= startTime && recordTime <= endTime
}

/** 应用筛选条件，返回过滤后的记录 */
export function applyFilter<T extends FilterableRecord>(
  records: T[],
  criteria: FilterCriteria,
  ocrResults: Record<string, string>,
): T[] {
  return records.filter((record) => {
    // 状态过滤
    if (record.status !== 'active') return false

    // 标签过滤
    if (criteria.tagFilter && criteria.tagFilter !== 'all' && !record.tagIds.includes(criteria.tagFilter)) {
      return false
    }

    // 构建搜索文本
    const searchText = buildSearchText(record, ocrResults)

    // 快速搜索检查
    if (!matchQuickSearch(searchText, criteria.searchKeyword)) {
      return false
    }

    // 黑名单检查（组间 OR，任一组命中就排除）
    for (const group of criteria.blacklistGroups) {
      if (group.keywords.length > 0 && matchKeywordGroup(searchText, group)) {
        return false
      }
    }

    // 白名单检查（组间 AND，所有组都要满足）
    for (const group of criteria.whitelistGroups) {
      if (group.keywords.length > 0 && !matchKeywordGroup(searchText, group)) {
        return false
      }
    }

    // 时间范围检查
    if (!matchTimeRange(record.createdAt, criteria.timeRange)) {
      return false
    }

    return true
  })
}
