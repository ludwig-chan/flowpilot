// ─── 消息类型 ──────────────────────────────────────────────────────────────────

// ─── Content Script → Background ──────────────────────────────────────────────
export interface FlowLogMessage {
  type: 'FLOW_LOG'
  text: string
}

export interface FlowDoneMessage {
  type: 'FLOW_DONE'
}

export interface FlowErrorMessage {
  type: 'FLOW_ERROR'
  error: string
}

// ─── Background → Content Script ──────────────────────────────────────────────
export interface CaptureContextElementMessage {
  type: 'CAPTURE_CONTEXT_ELEMENT'
}

// ─── Console Panel ────────────────────────────────────────────────────────────
export interface GetLogsMessage {
  type: 'GET_LOGS'
}

export interface ClearLogsMessage {
  type: 'CLEAR_LOGS'
}

// ─── 流程构建器（ConsolePanel → Background）─────────────────────────────────────
export interface SaveBuiltFlowMessage {
  type: 'SAVE_BUILT_FLOW'
  name: string
  steps: import('./flow').FlowStep[]
}

export interface GetBuiltFlowsMessage {
  type: 'GET_BUILT_FLOWS'
}

export interface DeleteBuiltFlowMessage {
  type: 'DELETE_BUILT_FLOW'
  id: string
}

// ─── 自动触发器 ───────────────────────────────────────────────────────────────

/** Background → Content Script：开始监听某个 CSS 选择器出现 */
export interface WatchElementTriggerMessage {
  type:     'WATCH_ELEMENT_TRIGGER'
  flowId:   string
  selector: string
  delay?:   number
}

/** Content Script → Background：选择器已出现，请运行流程 */
export interface ElementTriggerFiredMessage {
  type:   'ELEMENT_TRIGGER_FIRED'
  flowId: string
}

// ─── 智能列表循环选择器 ────────────────────────────────────────────────────────

/** 一个「重复结构」候选层 */
export interface RepeatingCandidate {
  /** 所有列表项的 CSS 选择器，e.g. "table.grid > tbody > tr" */
  itemSelector:     string
  /** querySelectorAll(itemSelector) 实际找到的数量 */
  count:            number
  /** 重复元素的 tagName，e.g. "TR" */
  tagName:          string
  /** 推断出的中文标签，e.g. "表格行"、"列表项"、"卡片" */
  inferredLabel:    string
  /** 从拾取元素往上数第几层（1 = 直接父节点） */
  depth:            number
}

/** Options → Content Script：激活智能列表分析拾取模式 */
export interface RequestSmartLoopAnalyzeMessage {
  type: 'REQUEST_SMART_LOOP_ANALYZE'
}

export interface RequestSmartLoopFromSelectorMessage {
  type:        'REQUEST_SMART_LOOP_FROM_SELECTOR'
  cssSelector: string
}

/** Content Script → Options（经 background 转发）：返回重复结构候选列表 */
export interface SmartLoopAnalyzedMessage {
  type:       'SMART_LOOP_ANALYZED'
  candidates: RepeatingCandidate[]
}

export interface SmartLoopDebugTraceRow {
  depth: number
  current: string
  parent: string
  sameSiblingCount: number
  accepted: boolean
  parentSelector?: string
  itemSelector?: string
  count?: number
  error?: string
}

export interface SmartLoopDebugMessage {
  type: 'SMART_LOOP_DEBUG'
  url: string
  inputSelector: string
  resolvedElement: string
  selectorError?: string
  trace: SmartLoopDebugTraceRow[]
  candidates: RepeatingCandidate[]
}

/** Options → Content Script：高亮所有与候选选择器匹配的元素（hover 预览用） */
export interface HighlightLoopCandidatesMessage {
  type:     'HIGHLIGHT_LOOP_CANDIDATES'
  selector: string
}

/** Options → Content Script：清除候选高亮 */
export interface ClearLoopHighlightsMessage {
  type: 'CLEAR_LOOP_HIGHLIGHTS'
}

// ─── 联合类型 ──────────────────────────────────────────────────────────────────
export type ExtensionMessage =
  | FlowLogMessage
  | FlowDoneMessage
  | FlowErrorMessage
  | CaptureContextElementMessage
  | GetLogsMessage
  | ClearLogsMessage
  | SaveBuiltFlowMessage
  | GetBuiltFlowsMessage
  | DeleteBuiltFlowMessage
  | WatchElementTriggerMessage
  | ElementTriggerFiredMessage
  | RequestSmartLoopAnalyzeMessage
  | RequestSmartLoopFromSelectorMessage
  | SmartLoopAnalyzedMessage
  | SmartLoopDebugMessage
  | HighlightLoopCandidatesMessage
  | ClearLoopHighlightsMessage

// ─── 消息类型常量（统一所有消息名，避免散落的字符串字面量）─────────────────────────
export const MSG = {
  // options → content（经 background 转发）
  REQUEST_DOM_SCAN:                 'REQUEST_DOM_SCAN',
  REQUEST_PICK_ELEMENT:             'REQUEST_PICK_ELEMENT',
  CANCEL_PICK_ELEMENT:              'CANCEL_PICK_ELEMENT',
  REQUEST_HIGHLIGHT:                'REQUEST_HIGHLIGHT',
  REQUEST_TEST_CLICK:               'REQUEST_TEST_CLICK',
  RUN_FLOW_IN_TAB:                  'RUN_FLOW_IN_TAB',
  STOP_FLOW_IN_TAB:                 'STOP_FLOW_IN_TAB',
  REQUEST_SMART_LOOP_ANALYZE:       'REQUEST_SMART_LOOP_ANALYZE',
  REQUEST_SMART_LOOP_FROM_SELECTOR: 'REQUEST_SMART_LOOP_FROM_SELECTOR',
  HIGHLIGHT_LOOP_CANDIDATES:        'HIGHLIGHT_LOOP_CANDIDATES',
  CLEAR_LOOP_HIGHLIGHTS:            'CLEAR_LOOP_HIGHLIGHTS',
  WATCH_ELEMENT_TRIGGER:            'WATCH_ELEMENT_TRIGGER',
  // content → options（经 background 广播）
  DOM_SCAN_RESULT:                  'DOM_SCAN_RESULT',
  ELEMENT_PICKED:                   'ELEMENT_PICKED',
  FLOW_LOG_FROM_TAB:                'FLOW_LOG_FROM_TAB',
  FLOW_DONE_FROM_TAB:               'FLOW_DONE_FROM_TAB',
  FLOW_ERROR_FROM_TAB:              'FLOW_ERROR_FROM_TAB',
  DOM_MUTATION:                     'DOM_MUTATION',
  SMART_LOOP_ANALYZED:              'SMART_LOOP_ANALYZED',
  SMART_LOOP_DEBUG:                 'SMART_LOOP_DEBUG',
  FLOW_STEP_EVENT_FROM_TAB:         'FLOW_STEP_EVENT_FROM_TAB',
  // content → background
  ELEMENT_TRIGGER_FIRED:            'ELEMENT_TRIGGER_FIRED',
  CAPTURE_CANVAS:                   'CAPTURE_CANVAS',
  FLOW_LOG:                         'FLOW_LOG',
  FLOW_DONE:                        'FLOW_DONE',
  FLOW_ERROR:                       'FLOW_ERROR',
  // background handlers（options/content → background）
  GET_LOGS:                         'GET_LOGS',
  CLEAR_LOGS:                       'CLEAR_LOGS',
  SAVE_BUILT_FLOW:                  'SAVE_BUILT_FLOW',
  GET_BUILT_FLOWS:                  'GET_BUILT_FLOWS',
  DELETE_BUILT_FLOW:                'DELETE_BUILT_FLOW',
  SYNC_FLOWS:                       'SYNC_FLOWS',
  OPEN_OPTIONS_PAGE:                'OPEN_OPTIONS_PAGE',
  SET_ACTIVE_TAB:                   'SET_ACTIVE_TAB',
  GET_ACTIVE_TAB:                   'GET_ACTIVE_TAB',
  SAVE_SCREENSHOT:                  'SAVE_SCREENSHOT',
  SAVE_DATA_RECORD:                 'SAVE_DATA_RECORD',
} as const
