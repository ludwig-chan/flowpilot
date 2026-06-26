import type { FlowStep } from '../types/flow'

/** 变量信息：内部名 + 用户别名 */
export interface VarInfo {
  internal: string   // 内部变量名，如 var0
  alias:    string   // 用户可见别名，如 "年龄"
}

/**
 * 递归收集流程中所有 get_text / save_canvas / 下载点击步骤的变量信息
 * 返回 { internal → alias } 的映射数组
 */
export function collectVarInfos(steps: FlowStep[]): VarInfo[] {
  const infos: VarInfo[] = []
  function walk(list: FlowStep[]) {
    for (const s of list) {
      if ((s.type === 'get_text' || s.type === 'save_canvas') && s.value?.trim()) {
        infos.push({
          internal: s.value.trim(),
          alias:    s.varAlias || s.value.trim(),   // fallback 到 value（兼容旧格式）
        })
      }
      if (s.captureDownload && s.downloadVarName?.trim()) {
        const name = s.downloadVarName.trim()
        infos.push({ internal: name, alias: name })
      }
      if (s.children?.length)     walk(s.children)
      if (s.elseChildren?.length) walk(s.elseChildren)
      // loop_items 的 itemActions 也可能包含变量赋值
      if (s.itemActions?.length)  walk(s.itemActions)
      if (s.itemAction)           walk([s.itemAction])
    }
  }
  walk(steps)
  // 去重（同一个 internal 可能被多次收集）
  const seen = new Set<string>()
  return infos.filter(v => {
    if (seen.has(v.internal)) return false
    seen.add(v.internal)
    return true
  })
}

/**
 * 从 VarInfo 数组构建 internal → alias 的 Map
 */
export function buildVarAliasMap(varInfos: VarInfo[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const v of varInfos) map.set(v.internal, v.alias)
  return map
}

/**
 * 显示变量名：优先别名，fallback 到内部名
 */
export function displayVarName(internal: string, alias?: string): string {
  return alias || internal
}

/**
 * 将表达式中的 {{internal}} 替换为别名显示
 * 如 "{{var0}} <= 30" → "年龄 <= 30"
 */
export function displayExprWithAliases(expr: string, varMap: Map<string, string>): string {
  return expr.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const alias = varMap.get(key)
    return alias ?? `{{${key}}}`
  })
}

/**
 * 将用户编辑的显示表达式还原为内部存储格式
 * 如 "年龄 <= 30" → "{{var0}} <= 30"
 * 只替换已知别名，未知文本保持原样
 */
export function storeExprFromDisplay(display: string, varMap: Map<string, string>): string {
  // 构建反向映射：alias → internal
  const reverseMap = new Map<string, string>()
  for (const [internal, alias] of varMap) {
    reverseMap.set(alias, internal)
  }
  // 按别名长度从长到短排序，避免短别名误替换长别名的一部分
  const aliases = [...reverseMap.keys()].sort((a, b) => b.length - a.length)
  let result = display
  for (const alias of aliases) {
    const internal = reverseMap.get(alias)!
    // 只替换不在 {{}} 内的别名文本（避免重复替换已存在的 {{var0}}）
    // 使用全局替换，因为别名可能出现在多个位置
    result = result.replace(new RegExp(escapeRegExp(alias), 'g'), `{{${internal}}}`)
  }
  return result
}

/**
 * 计算下一个 var 编号
 * 扫描已有步骤中所有匹配 varN 格式的 value，返回 N+1
 */
export function nextVarIndex(steps: FlowStep[]): number {
  let maxIdx = -1
  function walk(list: FlowStep[]) {
    for (const s of list) {
      if ((s.type === 'get_text' || s.type === 'save_canvas') && s.value?.trim()) {
        const match = s.value.trim().match(/^var(\d+)$/)
        if (match) maxIdx = Math.max(maxIdx, parseInt(match[1]))
      }
      if (s.children?.length)     walk(s.children)
      if (s.elseChildren?.length) walk(s.elseChildren)
      if (s.itemActions?.length)  walk(s.itemActions)
      if (s.itemAction)           walk([s.itemAction])
    }
  }
  walk(steps)
  return maxIdx + 1
}

/** 生成内部变量名：var0, var1, var2... */
export function genVarName(index: number): string {
  return `var${index}`
}

/** 生成默认别名：变量1, 变量2... */
export function genDefaultAlias(index: number): string {
  return `变量${index + 1}`
}

/** 正则特殊字符转义 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}