// ─── Options 页面 ↔ Content Script 的 DOM 通信序列化类型 ──────────────────────

export type ElementKind = 'click' | 'input' | 'select' | 'unknown'
export type Confidence  = 'high' | 'medium' | 'low'

/** 可序列化的单个元素描述（不含 Element 引用） */
export interface SerializedElement {
  kind:       ElementKind
  confidence: Confidence
  label:      string
  matchCount: number
  selector: {
    cssSelector: string
    ariaLabel?:  string
    role?:       string
    dataTestId?: string
    text?:       string
    relativeSelector?: string
  }
}

/** DOM 树节点（可序列化，无 Element 引用） */
export interface SerializedDomNode {
  depth:    number
  item:     SerializedElement | null   // null 表示该节点无可操作语义
  tag:      string                     // 小写标签名
  id:       string
  classes:  string                     // 空格分隔的 class 列表
  children: SerializedDomNode[]
  /** CSS 显示尺寸（来自 getBoundingClientRect，单位 px） */
  w?:       number
  h?:       number
  /** 可滚动内容尺寸（scrollWidth / scrollHeight） */
  scrollW?: number
  scrollH?: number
}

// ─── Options → Background → Content Script ──────────────────────────────────

/** 请求 content script 扫描并返回 DOM 树 */
export interface RequestDomScanMessage {
  type: 'REQUEST_DOM_SCAN'
  /** 可选：限定扫描范围的 CSS 选择器（如 "#sidebar"），不传则扫描整个页面 */
  scope?: string
}

/** 请求 content script 进入元素拾取模式 */
export interface RequestPickElementMessage {
  type: 'REQUEST_PICK_ELEMENT'
  /** 可选：限定拾取范围的 CSS 选择器（如 "#sidebar"），不传则全页面可拾取 */
  scope?: string
  mode?: 'smart_loop'
}

/** 取消拾取模式 */
export interface CancelPickElementMessage {
  type: 'CANCEL_PICK_ELEMENT'
}

/** Options 请求在页面上高亮某个元素（可选） */
export interface RequestHighlightMessage {
  type:        'REQUEST_HIGHLIGHT'
  cssSelector: string
}

/** Options 请求在页面上试点击某个元素（验证选择器是否正确触发） */
export interface RequestTestClickMessage {
  type:        'REQUEST_TEST_CLICK'
  cssSelector: string
}

/** Options → Background：请求在指定 tab 上运行流程 */
export interface RunFlowInTabMessage {
  type:              'RUN_FLOW_IN_TAB'
  tabId:             number
  flowId?:           string
  flowName?:         string
  runId?:            string
  runStartedAt?:     string
  steps:             import('./flow').FlowStep[]
  variables:         Record<string, string>
  stepDelayLevel?:   import('./flow').StepDelayLevel
  stepDelayRange?:   [number, number]
  waitTimeout?:      number
}

/** Options → Background：请求停止流程 */
export interface StopFlowInTabMessage {
  type:  'STOP_FLOW_IN_TAB'
  tabId: number
}

// ─── Content Script → Background → Options ──────────────────────────────────

/** DOM 扫描结果推送 */
export interface DomScanResultMessage {
  type:     'DOM_SCAN_RESULT'
  tabId:    number
  tabTitle: string
  tabUrl:   string
  tree:     SerializedDomNode[]
  scopeCanonicalSelector?: string
}

/** 元素拾取结果 */
export interface ElementPickedMessage {
  type:    'ELEMENT_PICKED'
  tabId:   number
  element: SerializedElement
}

/** 流程执行日志（单条） */
export interface FlowLogFromTabMessage {
  type:  'FLOW_LOG_FROM_TAB'
  tabId: number
  text:  string
}

/** 流程执行完成 */
export interface FlowDoneFromTabMessage {
  type:  'FLOW_DONE_FROM_TAB'
  tabId: number
  screenshotCount?: number
}

/** 流程执行出错 */
export interface FlowErrorFromTabMessage {
  type:  'FLOW_ERROR_FROM_TAB'
  tabId: number
  error: string
}

/** 流程步骤执行事件（进度追踪用） */
export interface FlowStepEventFromTabMessage {
  type:  'FLOW_STEP_EVENT_FROM_TAB'
  tabId: number
  event: import('./flow').StepEvent
}
