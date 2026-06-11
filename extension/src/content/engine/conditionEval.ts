export function interpolate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => variables[key] ?? '')
}

type SupportedOperator = '>=' | '<=' | '!=' | '==' | 'not_contains' | 'contains' | '>' | '<'

const ops: SupportedOperator[] = ['>=', '<=', '!=', '==', 'not_contains', 'contains', '>', '<']

function trimValue(s: string): string {
  return s.trim().replace(/^["']|["']$/g, '')
}

// 从字符串中提取数字（支持 "¥350"、"共 42 条" 等格式）
function num(s: string): number {
  const n = parseFloat(s)
  if (!isNaN(n)) return n
  const m = s.match(/-?\d+\.?\d*/)
  return m ? parseFloat(m[0]) : NaN
}

export function evalConditionParts(leftRaw: string, op: SupportedOperator, rightRaw: string): boolean {
  const left = trimValue(leftRaw)
  const right = trimValue(rightRaw)
  if (op === 'contains') return left.includes(right)
  if (op === 'not_contains') return !left.includes(right)
  const l = num(left), r = num(right)
  if (!isNaN(l) && !isNaN(r)) {
    if (op === '>') return l > r
    if (op === '<') return l < r
    if (op === '>=') return l >= r
    if (op === '<=') return l <= r
    if (op === '==') return l === r
    if (op === '!=') return l !== r
  }
  if (op === '==') return left === right
  if (op === '!=') return left !== right
  return false
}

// 安全地对字符串表达式求值（支持 > < >= <= == != contains）
// 示例：'35 > 30'、'hello contains world'、'18 >= 18'
export function evalCondition(expr: string): boolean {
  // 按运算符优先级从长到短匹配，避免 >= 被 > 提前截断
  for (const op of ops) {
    const idx = expr.indexOf(op)
    if (idx === -1) continue
    return evalConditionParts(expr.slice(0, idx), op, expr.slice(idx + op.length))
  }
  // 无运算符：非空视为真
  return expr.trim().length > 0
}

// ─── 多条件组合求值 ────────────────────────────────────────────────────────────
interface CondItemLike {
  mode: string
  value?: string
  selector?: string
  leftVar?: string
  operator?: SupportedOperator
  rightValue?: string
}

function evalOne(cond: CondItemLike, variables: Record<string, string>): boolean {
  if (cond.mode === 'elem') {
    return !!document.querySelector(cond.selector ?? '')
  }
  if (cond.leftVar && cond.operator && cond.rightValue !== undefined) {
    return evalConditionParts(
      variables[cond.leftVar] ?? '',
      cond.operator,
      interpolate(cond.rightValue, variables),
    )
  }
  return evalCondition(interpolate(cond.value ?? '', variables))
}

/**
 * 对多个条件按 AND/OR 组合求值
 * - logic='and' → 所有条件都成立才为 true
 * - logic='or'  → 任一条件成立即为 true
 * - 空数组直接返回 true
 */
export function evalMultiCondition(
  conditions: CondItemLike[],
  logic: 'and' | 'or',
  variables: Record<string, string>,
): boolean {
  if (!conditions.length) return true
  return logic === 'and'
    ? conditions.every(c => evalOne(c, variables))
    : conditions.some(c => evalOne(c, variables))
}
