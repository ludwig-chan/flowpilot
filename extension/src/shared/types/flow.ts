// ─── 选择器策略（从稳定到脆弱依次尝试）───────────────────────────────────────
export interface SelectorStrategy {
  ariaLabel?:      string
  text?:           string
  role?:           string
  dataTestId?:     string
  cssSelector:     string       // 内部路径（iframe 内则是 iframe 文档内的路径）
  iframeSelector?: string       // 如果元素在 iframe 内，指向该 iframe 元素的顶层路径
}

// ─── 原子动作类型 ──────────────────────────────────────────────────────────────
export type ActionType =
  | 'click'
  | 'double_click'
  | 'right_click'
  | 'hover'
  | 'input'
  | 'clear'
  | 'select'
  | 'check'
  | 'focus'
  | 'press_key'
  | 'get_text'
  | 'wait_appear'
  | 'wait_disappear'
  | 'scroll_to'
  | 'navigate'
  | 'loop_items'
  | 'condition'
  | 'element_branch'
  | 'delay'
  | 'call_flow'
  | 'save_canvas'

// ─── 多条件分支 ────────────────────────────────────────────────────────────────
export interface ConditionItem {
  id:       string
  mode:     'expr' | 'elem'
  value?:   string       // expr 模式：如 "{{price}} > 100"
  selector?: string      // elem 模式：CSS 选择器
}
export type ConditionLogic = 'and' | 'or'

// ─── 单个步骤 ──────────────────────────────────────────────────────────────────
export interface FlowStep {
  id: string
  type: ActionType
  label: string
  selector?: SelectorStrategy
  value?: string            // 支持变量插值 {{varName}}
  delay?: [number, number]  // [min, max] ms，步骤执行完后的随机延迟
  waitTimeout?: number      // 等待元素出现的超时时间 ms（覆盖流程级默认值）
  foundDelay?: [number, number]  // 元素出现后、执行动作前的随机等待 ms
  children?: FlowStep[]     // loop_items / condition 子步骤
  flowRef?: string          // call_flow: 引用的已保存流程 ID
  itemDelay?: [number, number] // loop_items: 每项处理完后的随机延迟 [min, max] ms
  scrollBehavior?: 'none' | 'item' | 'bottom' // loop_items: 每项处理前/后的滚动行为
  relativeSelector?: boolean // 子步骤专用：selector 相对于所在列表项而非整个页面
  elseChildren?: FlowStep[] // condition: else 分支步骤
  conditions?:      ConditionItem[]   // condition: 多条件列表
  conditionLogic?:  ConditionLogic    // condition: 条件连接方式，默认 'and'
}

// ─── 触发器 ────────────────────────────────────────────────────────────────────
export type TriggerType   = 'url_match' | 'element_appear'
export type UrlMatchMode  = 'contains'  | 'startsWith' | 'equals' | 'regex'

export interface FlowTrigger {
  enabled:       boolean
  type:          TriggerType
  /** url_match: 匹配的 URL 规则；element_appear: 可选的 URL 过滤（空则全页面监听） */
  urlPattern?:   string
  urlMatchMode?: UrlMatchMode
  /** element_appear: 要监听出现的 CSS 选择器 */
  selector?:     string
  /** 触发条件满足后延迟多少 ms 再运行流程（默认 0） */
  delay?:        number
}

// ─── 运行时状态 ────────────────────────────────────────────────────────────────
export type TaskStatus = 'idle' | 'running' | 'done' | 'error'

// ─── 步骤间隔档位 ──────────────────────────────────────────────────────────────
export type StepDelayLevel = 'none' | 'low' | 'medium' | 'high' | 'custom'

/** 各档位对应的 [min, max] 延迟范围（毫秒），humanDelay 会在此范围内按正态分布取值 */
export const STEP_DELAY_PRESETS: Record<'low' | 'medium' | 'high', [number, number]> = {
  low:    [300,  800],
  medium: [1000, 3000],
  high:   [3000, 8000],
}

// ─── 步骤执行事件（运行时进度） ─────────────────────────────────────────────────
export type StepEvent =
  | { type: 'step_start'; stepId: string; label: string; depth: number }
  | { type: 'step_done';  stepId: string; depth: number }
  | { type: 'loop_progress'; stepId: string; index: number; total: number }

