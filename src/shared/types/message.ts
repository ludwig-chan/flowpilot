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
  /** 从列表项到目标元素的相对路径，e.g. "td:last-child > button" */
  relativeSelector: string
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

/** Content Script → Options（经 background 转发）：返回重复结构候选列表 */
export interface SmartLoopAnalyzedMessage {
  type:       'SMART_LOOP_ANALYZED'
  element:    import('./dom').SerializedElement
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
  | SmartLoopAnalyzedMessage
  | HighlightLoopCandidatesMessage
  | ClearLoopHighlightsMessage
