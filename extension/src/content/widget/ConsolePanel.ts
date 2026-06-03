import type { FlowStep, SelectorStrategy } from '@shared/types/flow'
import { runFlow } from '../engine/SemanticRunner'

const PANEL_W = 420
const BUILDER_W = 340

// ── 可操作性置信度 ─────────────────────────────────────────────────────────────
type Confidence = 'high' | 'medium' | 'low'

interface ScannedElement {
  el: Element
  kind: 'click' | 'input' | 'select' | 'unknown'
  confidence: Confidence
  label: string
  selector: SelectorStrategy
  matchCount: number        // 同一选择器在页面上匹配的数量
}

// DOM 树节点（保留完整树结构；item 为 null 表示当前分析认为不可操作）
interface DomNode {
  el: Element
  depth: number
  item: ScannedElement | null
  children: DomNode[]
}

// 绝对排除的标签（代码不可能操作）
const EXCLUDE_TAGS = new Set(['SCRIPT', 'STYLE', 'META', 'LINK', 'HEAD',
  'HTML', 'BR', 'HR', 'NOSCRIPT', 'TEMPLATE', 'SLOT'])

interface ConsolePanelCtrl {
  toggle: () => void
}

interface LocalFlow {
  id: string
  name: string
  steps: FlowStep[]
  pinnedInMenu?: boolean
}

type ConsolePanelHost = HTMLElement & { __fp_toggle?: () => void }

export function initConsolePanel(): ConsolePanelCtrl {
  const existing = document.getElementById('fp-console-host') as ConsolePanelHost | null
  if (existing?.__fp_toggle) return { toggle: () => existing.__fp_toggle!() }

  const host = document.createElement('div') as ConsolePanelHost
  host.id = 'fp-console-host'
  Object.assign(host.style, {
    position: 'fixed',
    right: '0',
    top: '0',
    height: '100vh',
    width: `${PANEL_W}px`,
    zIndex: '2147483646',
    overflow: 'hidden',
    pointerEvents: 'none',
  })
  // 挂在 <html> 而非 <body>：后续用 body transform 推页时 host 不受影响
  document.documentElement.appendChild(host)
  const shadow = host.attachShadow({ mode: 'open' })

  const styleEl = document.createElement('style')
  styleEl.textContent = buildCSS()
  shadow.appendChild(styleEl)

  const panel = shadow.appendChild(document.createElement('div'))
  panel.className = 'cp'
  panel.style.transform = `translateX(${PANEL_W}px)`

  // ── Header ────────────────────────────────────────────────────────────────
  const hdr = panel.appendChild(document.createElement('div'))
  hdr.className = 'cp-hdr'

  const titleEl = hdr.appendChild(document.createElement('button'))
  titleEl.className = 'cp-hdr-back'
  titleEl.textContent = '返回'
  titleEl.style.display = 'none'

  const centerEl = hdr.appendChild(document.createElement('span'))
  centerEl.className = 'cp-hdr-center'
  centerEl.textContent = 'FlowPilot'

  const acts = hdr.appendChild(document.createElement('div'))
  acts.className = 'cp-acts'
  const menuBtn  = mkAct(acts, '⋯', '布局选项')
  const closeBtn = mkAct(acts, '✕', '关闭')

  // ── Body ──────────────────────────────────────────────────────────────────
  const body = panel.appendChild(document.createElement('div'))
  body.className = 'cp-body'

  // 元素扫描面板（非主视图，按需切换）
  const scanPane = body.appendChild(document.createElement('div'))
  scanPane.className = 'cp-scan-pane'
  scanPane.style.display = 'none'

  // 流程面板（主视图）
  const flowPane = body.appendChild(document.createElement('div'))
  flowPane.className = 'cp-flow-pane'

  // ── 拖拽调整尺寸手柄 ────────────────────────────────────────────────────────
  const resizeHandle = panel.appendChild(document.createElement('div'))
  resizeHandle.className = 'cp-resize-handle'

  // ── 布局模式下拉菜单 ─────────────────────────────────────────────────────────
  const modeMenu = panel.appendChild(document.createElement('div'))
  modeMenu.className = 'cp-mode-menu'
  modeMenu.style.display = 'none'
  ;(['right', 'bottom', 'float'] as const).forEach(m => {
    const item = modeMenu.appendChild(document.createElement('button'))
    item.className = 'cp-mode-item'
    item.dataset.mode = m
    item.textContent = { right: '右侧抽屉', bottom: '底部抽屉', float: '悬浮窗' }[m]
    item.addEventListener('click', () => { setMode(m); modeMenu.style.display = 'none' })
  })

  // ── State ─────────────────────────────────────────────────────────────────
  let visible    = false
  type PanelMode = 'right' | 'bottom' | 'float'
  let panelMode: PanelMode = 'right'
  let currentW      = PANEL_W
  let currentBottomH = 360
  let floatX = Math.max(20, window.innerWidth  - PANEL_W - 20)
  let floatY = 80
  let floatW = PANEL_W
  let floatH = 560
  let activeTab: 'scan' | 'flow' = 'flow'
  let logSectionOpen = true
  let inlineLogContainer: HTMLElement | null = null
  let lastRenderedLogs: string[] = []
  let ticker: ReturnType<typeof setInterval> | null = null

  // ── setMode ───────────────────────────────────────────────────────────────
  function setMode(m: PanelMode): void {
    panelMode = m
    // 更新激活项样式
    modeMenu.querySelectorAll<HTMLElement>('.cp-mode-item').forEach(el => {
      el.classList.toggle('cp-mode-item--on', el.dataset.mode === m)
    })
    if (m === 'right') {
      Object.assign(host.style, { right:'0', top:'0', left:'', bottom:'', width:`${currentW}px`, height:'100vh' })
      panel.style.removeProperty('border-radius')
      panel.style.removeProperty('border-top')
      panel.style.removeProperty('border')
      panel.style.borderLeft = '1px solid #313244'
      resizeHandle.style.cssText = 'position:absolute;left:0;top:0;bottom:0;width:4px;cursor:ew-resize;z-index:10'
      panel.style.transform = visible ? 'translateX(0)' : `translateX(${currentW}px)`
      if (visible) applyPush(currentW)
    } else if (m === 'bottom') {
      clearPush()
      Object.assign(host.style, { bottom:'0', left:'0', right:'', top:'', width:'100vw', height:`${currentBottomH}px` })
      panel.style.removeProperty('border-left')
      panel.style.removeProperty('border-radius')
      panel.style.borderTop = '1px solid #313244'
      resizeHandle.style.cssText = 'position:absolute;top:0;left:0;right:0;height:4px;cursor:ns-resize;z-index:10'
      panel.style.transform = visible ? 'translateY(0)' : `translateY(${currentBottomH}px)`
    } else {
      clearPush()
      Object.assign(host.style, { top:`${floatY}px`, left:`${floatX}px`, right:'', bottom:'', width:`${floatW}px`, height:`${floatH}px` })
      panel.style.borderRadius = '10px'
      panel.style.border = '1px solid #45475a'
      resizeHandle.style.cssText = 'position:absolute;right:0;bottom:0;width:14px;height:14px;cursor:nwse-resize;z-index:10;background:transparent'
      panel.style.transform = visible ? 'none' : 'scale(.95)'
      panel.style.opacity   = visible ? '1' : '0'
    }
  }

  // ── Resize handle drag ────────────────────────────────────────────────────
  {
    let isResizing = false
    let startPointer = 0
    let startDim = 0
    let startPointerY = 0
    let startDimH = 0

    resizeHandle.addEventListener('mousedown', (e: MouseEvent) => {
      isResizing = true
      startPointer = panelMode === 'bottom' ? e.clientY : e.clientX
      startDim = panelMode === 'bottom' ? currentBottomH : (panelMode === 'float' ? floatW : currentW)
      startPointerY = e.clientY
      startDimH = floatH
      e.preventDefault()
    })

    document.addEventListener('mousemove', (e: MouseEvent) => {
      if (!isResizing) return
      if (panelMode === 'bottom') {
        const newH = Math.max(200, Math.min(window.innerHeight - 80, startDim + (startPointer - e.clientY)))
        currentBottomH = newH
        host.style.height = `${newH}px`
      } else if (panelMode === 'float') {
        const newW = Math.max(280, Math.min(1000, startDim + (e.clientX - startPointer)))
        const newH = Math.max(200, Math.min(window.innerHeight - 40, startDimH + (e.clientY - startPointerY)))
        floatW = newW; floatH = newH
        host.style.width = `${newW}px`
        host.style.height = `${newH}px`
      } else {
        const newW = Math.max(280, Math.min(900, startDim + (startPointer - e.clientX)))
        currentW = newW
        host.style.width = `${newW}px`
        if (visible && panelMode === 'right') {
          panel.style.transform = 'translateX(0)'
          applyPush(newW)
        }
      }
    })

    document.addEventListener('mouseup', () => { isResizing = false })
  }

  // ── Float mode header drag ────────────────────────────────────────────────
  {
    let isDragging = false
    let dragStartX = 0, dragStartY = 0, dragOrigX = 0, dragOrigY = 0

    hdr.addEventListener('mousedown', (e: MouseEvent) => {
      if (panelMode !== 'float') return
      isDragging = true
      dragStartX = e.clientX; dragStartY = e.clientY
      dragOrigX = floatX; dragOrigY = floatY
      e.preventDefault()
    })

    document.addEventListener('mousemove', (e: MouseEvent) => {
      if (!isDragging) return
      floatX = Math.max(0, Math.min(window.innerWidth  - floatW,  dragOrigX + (e.clientX - dragStartX)))
      floatY = Math.max(0, Math.min(window.innerHeight - floatH,    dragOrigY + (e.clientY - dragStartY)))
      host.style.left = `${floatX}px`
      host.style.top  = `${floatY}px`
    })

    document.addEventListener('mouseup', () => { isDragging = false })
  }

  // ── Header back button dynamic action ───────────────────────────────────
  let hdrBackAction: (() => void) | null = null
  titleEl.addEventListener('click', () => hdrBackAction?.())
  function setHdrBack(action: (() => void) | null): void {
    hdrBackAction = action
    titleEl.style.display = action ? '' : 'none'
  }

  // DOM 树扫描结果
  let domTree: DomNode[] = []
  let treeFilterConf = 'all'   // 'all' | 'suspected' | 'confirmed'
  let treeFilterKind = 'all'   // 'all' | 'click' | 'input' | 'select'
  let treeFilterText = ''      // 选择器/标签/id/class 搜索文本
  const collapsedNodes = new Set<Element>()
  // 跨渲染持久的选中状态（供拾取器使用）
  let selectedEl: Element | null = null
  let selectedItem: ScannedElement | null = null
  // 外部触发树重绘+定位（renderScanPane 内赋值）
  let triggerTreeRenderAndScroll: (() => void) | null = null
  // DOM 树拾取模式：设置后，下次点击任意节点行会触发回调而不是普通选中
  let treePickMode: {
    label: string                            // 顶部 banner 提示文字
    filter?: (el: Element) => boolean        // 可选：限制可选范围，返回 false 则闪红提示
    onPick: (el: Element) => void            // 选中后回调
    onCancel: () => void                     // 取消回调
  } | null = null

  function expandPathToEl(target: Element): boolean {
    function walk(nodes: DomNode[], ancestors: Element[]): boolean {
      for (const n of nodes) {
        if (n.el === target) {
          ancestors.forEach(a => collapsedNodes.delete(a))
          collapsedNodes.delete(target)
          return true
        }
        ancestors.push(n.el)
        if (walk(n.children, ancestors)) return true
        ancestors.pop()
      }
      return false
    }
    return walk(domTree, [])
  }

  // 流程项目列表
  let flows: LocalFlow[] = []
  let activeFlowId: string | null = null
  let selectedStepIds = new Set<string>()
  let lastClickedStepId: string | null = null
  let pendingConditionTarget: { stepId: string; branch: 'then' | 'else' } | null = null
  let pendingLoopChildTarget: string | null = null   // 循环步骤 id，用于从扫描面板向循环体追加子步骤
  let flowsReady = false
  const draftFlowIds = new Set<string>() // 新建但尚未保存的流程

  const activeFlow = (): LocalFlow | undefined => flows.find(f => f.id === activeFlowId)
  const activeSteps = (): FlowStep[] => activeFlow()?.steps ?? []
  const mkFlowId = (): string => `lf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const mkStepId = (): string => `s_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  function ensureActiveFlow(): void {
    if (!activeFlowId || !flows.some(f => f.id === activeFlowId)) {
      const id = mkFlowId()
      flows.push({ id, name: `流程 ${flows.length + 1}`, steps: [] })
      activeFlowId = id
    }
  }

  // 面板初始化时从 Chrome storage 加载已持久化流程
  chrome.runtime.sendMessage({ type: 'GET_BUILT_FLOWS' })
    .then((res: { ok: boolean; flows: LocalFlow[] }) => {
      if (Array.isArray(res?.flows) && res.flows.length) {
        const storageIds = new Set(res.flows.map((f: LocalFlow) => f.id))
        const localOnly = flows.filter(f => !storageIds.has(f.id))
        flows = [...res.flows, ...localOnly]
      }
      flowsReady = true
    })
    .catch(() => { flowsReady = true })

  // 用户设置
  const settings = {
    hlColor: '#f5c542',
    hlBgOpacity: 0.45,
    selColor: '#a6e3a1',
    selBgOpacity: 0.35,
    builderMode: 'squeeze' as 'squeeze' | 'overlay',
  }

  // ── 页面元素高亮（外部作用域，跳过重渲染泄漏） ───────────────────────────
  let hoverHlEl: HTMLDivElement | null = null
  let selectedHlEl: HTMLDivElement | null = null

  function showHoverHl(el: Element): void {
    hoverHlEl?.remove()
    const r = el.getBoundingClientRect()
    if (!r.width && !r.height) return
    hoverHlEl = document.createElement('div')
    Object.assign(hoverHlEl.style, {
      position: 'fixed',
      left: `${r.left}px`, top: `${r.top}px`,
      width: `${r.width}px`, height: `${r.height}px`,
      background: `rgba(${hexToRgbStr(settings.hlColor)},${settings.hlBgOpacity})`,
      border: `2px solid ${settings.hlColor}`,
      boxShadow: `0 0 0 1px rgba(${hexToRgbStr(settings.hlColor)},.3)`,
      outline: `1px dashed ${settings.hlColor}`,
      outlineOffset: '1px',
      borderRadius: '2px',
      pointerEvents: 'none',
      zIndex: '2147483644',
      boxSizing: 'border-box',
      transition: 'opacity .1s',
    })
    document.body.appendChild(hoverHlEl)
  }
  function clearHoverHl(): void { hoverHlEl?.remove(); hoverHlEl = null }
  function showSelectedHl(el: Element): void {
    selectedHlEl?.remove()
    const r = el.getBoundingClientRect()
    if (!r.width && !r.height) return
    selectedHlEl = document.createElement('div')
    Object.assign(selectedHlEl.style, {
      position: 'fixed',
      left: `${r.left}px`, top: `${r.top}px`,
      width: `${r.width}px`, height: `${r.height}px`,
      background: `rgba(${hexToRgbStr(settings.selColor)},${settings.selBgOpacity})`,
      border: `2px solid ${settings.selColor}`,
      boxShadow: `0 0 0 2px rgba(${hexToRgbStr(settings.selColor)},.25)`,
      outline: `1px solid ${settings.selColor}`,
      outlineOffset: '2px',
      borderRadius: '2px',
      pointerEvents: 'none',
      zIndex: '2147483643',
      boxSizing: 'border-box',
    })
    document.body.appendChild(selectedHlEl)
  }
  function clearSelectedHl(): void { selectedHlEl?.remove(); selectedHlEl = null }

  // ── Log rendering ─────────────────────────────────────────────────────────
  async function fetchLogs(): Promise<void> {
    if (!inlineLogContainer) return
    try {
      const res = await chrome.runtime.sendMessage({ type: 'GET_LOGS' }) as
        | { ok: boolean; logs: string[] }
        | undefined
      renderLogs(res?.logs ?? [])
    } catch { /* SW sleeping */ }
  }

  function renderLogs(logs: string[]): void {
    const container = inlineLogContainer
    if (!container) return
    lastRenderedLogs = logs
    container.innerHTML = ''
    if (!logs.length) {
      const empty = container.appendChild(document.createElement('div'))
      empty.className = 'cp-empty'
      empty.textContent = '暂无日志，运行流程后日志会出现在这里。'
      return
    }
    logs.slice(-50).forEach(text => {
      const line = container.appendChild(document.createElement('div'))
      line.className = 'cp-line'
      const m = text.match(/^\[(.+?)\] (.*)$/)
      if (m) {
        const ts = line.appendChild(document.createElement('span'))
        ts.className = 'cp-ts'
        ts.textContent = m[1]
        const msg = line.appendChild(document.createElement('span'))
        msg.className = 'cp-msg'
        msg.textContent = m[2]
      } else {
        const msg = line.appendChild(document.createElement('span'))
        msg.className = 'cp-msg'
        msg.textContent = text
      }
    })
    container.scrollTop = container.scrollHeight
  }

  // ── DOM Tree Scanner ──────────────────────────────────────────────────────
  function scanDomTree(): void {
    domTree = []
    collapsedNodes.clear()
    const MAX_DEPTH = 30
    const MAX_NODES = 5000
    let nodeCount = 0

    const walk = (el: Element, depth: number, parentList: DomNode[]): void => {
      if (EXCLUDE_TAGS.has(el.tagName)) return
      // 超限时跳过当前节点的子树，但不中断兄弟节点的遍历
      if (nodeCount >= MAX_NODES) return

      const tagLower = el.tagName.toLowerCase()
      const elHTML   = el as HTMLElement

      // 跳过隐藏的大型子树（如 SVG 雪碧图）：节省节点配额给真正的 UI 内容
      // 用 inline style / hidden 属性做轻量判断，避免触发 getComputedStyle 的重排
      const isInlineHidden = elHTML.hidden
        || elHTML.style?.display === 'none'
        || elHTML.style?.visibility === 'hidden'
        || el.getAttribute('aria-hidden') === 'true'
      if (isInlineHidden && el.children.length > 2) return

      const item = classifyElement(el)
      const node: DomNode = { el, depth, item, children: [] }
      parentList.push(node)
      nodeCount++

      // 默认折叠第 4 层及以下，减少视觉噪音
      if (depth >= 3) collapsedNodes.add(el)

      // SVG 内部元素（path / symbol / defs / g 等）永远不是可操作 UI 元素
      // 保留 <svg> 节点本身（可能是 icon 按钮），但不递归其子树以节省配额
      if (tagLower === 'svg') return

      // iframe：尝试穿透进入同源内容，跨域会抛 SecurityError 则静默忽略
      if (tagLower === 'iframe') {
        try {
          const iframeDoc = (el as HTMLIFrameElement).contentDocument
          if (iframeDoc?.body) {
            if (depth >= 3) collapsedNodes.add(iframeDoc.body)
            for (const child of iframeDoc.body.children) {
              if (nodeCount >= MAX_NODES) break
              walk(child, depth + 1, node.children)
            }
          }
        } catch {
          // 跨域 iframe，无法访问内容，保留 <iframe> 节点本身但不展开
        }
        return
      }

      if (depth < MAX_DEPTH) {
        // 先遍历 Shadow DOM（open shadow root），让 web components 内的元素也能被扫到
        const shadowRoot = (el as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot
        if (shadowRoot) {
          for (const child of shadowRoot.children) {
            if (nodeCount >= MAX_NODES) break
            walk(child, depth + 1, node.children)
          }
        }
        for (const child of el.children) {
          if (nodeCount >= MAX_NODES) break  // 超限后停止继续展开子节点，但已入树节点保留
          walk(child, depth + 1, node.children)
        }
      }
    }

    if (document.body) walk(document.body, 0, domTree)
  }

  function renderScanPane(): void {
    scanPane.innerHTML = ''

    // ── 工具栏 ──────────────────────────────────────────────────────────────
    const bar = scanPane.appendChild(document.createElement('div'))
    bar.className = 'cp-scan-bar'

    // 行1：拾取（独占行，醒目）
    const barRow1 = bar.appendChild(document.createElement('div'))
    barRow1.className = 'cp-scan-bar-row'
    const pickBtn = barRow1.appendChild(document.createElement('button'))
    pickBtn.className = 'cp-dom-rb cp-dom-rb--pick'
    pickBtn.textContent = '🎯 拾取元素'
    pickBtn.title = '点击页面元素，定位到 DOM 树'
    pickBtn.addEventListener('click', () => {
      // 暂时禁用面板交互层
      host.style.pointerEvents = 'none'
      pickBtn.classList.add('cp-dom-rb--active')

      const ov = document.createElement('div')
      ov.style.cssText = 'position:fixed;inset:0;z-index:2147483645;cursor:crosshair'
      const hlDiv = document.createElement('div')
      hlDiv.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483645;border:2px solid #89b4fa;background:rgba(137,180,250,.15);box-sizing:border-box;border-radius:2px;transition:all .05s'
      document.body.append(ov, hlDiv)

      let cur: Element | null = null
      const onMove = (e: MouseEvent) => {
        ov.style.pointerEvents = 'none'
        const t = document.elementFromPoint(e.clientX, e.clientY)
        ov.style.pointerEvents = ''
        if (!t || t === hlDiv) return
        cur = t
        const r = t.getBoundingClientRect()
        Object.assign(hlDiv.style, {
          left: `${r.left}px`, top: `${r.top}px`,
          width: `${r.width}px`, height: `${r.height}px`,
        })
      }
      const cleanup = () => {
        ov.remove(); hlDiv.remove()
        document.removeEventListener('mousemove', onMove, true)
        document.removeEventListener('click',     onClick, true)
        document.removeEventListener('keydown',   onKey,   true)
        host.style.pointerEvents = 'all'
        pickBtn.classList.remove('cp-dom-rb--active')
      }
      const onClick = (e: MouseEvent) => {
        e.preventDefault(); e.stopImmediatePropagation()
        if (!cur) { cleanup(); return }
        const target = cur
        cleanup()
        if (!domTree.length) scanDomTree()
        // 若在当前树中找不到（动态内容 / Shadow DOM），重新扫描再定位
        if (!expandPathToEl(target)) {
          scanDomTree()
          expandPathToEl(target)
        }
        selectedEl = target
        selectedItem = classifyElement(target)
        if (activeTab !== 'scan') switchTab('scan')
        else if (triggerTreeRenderAndScroll) triggerTreeRenderAndScroll()
      }
      const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cleanup() }

      document.addEventListener('mousemove', onMove, true)
      document.addEventListener('click',     onClick, true)
      document.addEventListener('keydown',   onKey,   true)
    })

    // 行2：全部展开 / 全部收起
    const barRow2 = bar.appendChild(document.createElement('div'))
    barRow2.className = 'cp-scan-bar-row'
    const expandAllBtn = barRow2.appendChild(document.createElement('button'))
    expandAllBtn.className = 'cp-dom-rb'
    expandAllBtn.textContent = '全部展开'
    expandAllBtn.addEventListener('click', () => { collapsedNodes.clear(); renderTree() })

    const collapseAllBtn = barRow2.appendChild(document.createElement('button'))
    collapseAllBtn.className = 'cp-dom-rb'
    collapseAllBtn.textContent = '全部收起'
    collapseAllBtn.addEventListener('click', () => {
      function addAll(nodes: DomNode[]): void {
        nodes.forEach(n => { collapsedNodes.add(n.el); addAll(n.children) })
      }
      addAll(domTree)
      renderTree()
    })

    const statsLbl = barRow2.appendChild(document.createElement('span'))
    statsLbl.className = 'cp-dom-hint'
    statsLbl.style.flex = '1'

    // 行3：重新扫描（左） + 设置（右）
    const barRow3 = bar.appendChild(document.createElement('div'))
    barRow3.className = 'cp-scan-bar-row'
    const scanBtn = barRow3.appendChild(document.createElement('button'))
    scanBtn.className = 'cp-dom-rb'
    scanBtn.textContent = '重新扫描'
    scanBtn.addEventListener('click', () => { scanDomTree(); renderScanPane() })
    const barRow3Spacer = barRow3.appendChild(document.createElement('span'))
    barRow3Spacer.style.flex = '1'
    const gearBtn = barRow3.appendChild(document.createElement('button'))
    gearBtn.className = 'cp-dom-rb'
    gearBtn.textContent = '设置'
    gearBtn.addEventListener('click', () => openSettings())

    // ── 选择器 / 标签搜索框 ──────────────────────────────────────────────────
    const searchWrap = scanPane.appendChild(document.createElement('div'))
    searchWrap.className = 'cp-tree-search-wrap'
    const searchInput = searchWrap.appendChild(document.createElement('input'))
    searchInput.className = 'cp-tree-search'
    searchInput.placeholder = '筛选 选择器 / 标签 / id / class…'
    searchInput.value = treeFilterText
    searchInput.addEventListener('input', () => {
      treeFilterText = searchInput.value.trim()
      searchClear.style.display = searchInput.value ? '' : 'none'
      renderTree()
    })
    const searchClear = searchWrap.appendChild(document.createElement('button'))
    searchClear.className = 'cp-search-clear'
    searchClear.textContent = '✕'
    searchClear.title = '清空筛选'
    searchClear.style.display = treeFilterText ? '' : 'none'
    searchClear.addEventListener('click', () => {
      treeFilterText = ''
      searchInput.value = ''
      searchClear.style.display = 'none'
      renderTree()
    })

    // ── 筛选结果批量操作栏（有筛选词 + 可操作结果时显示）──────────────────────
    const filterBar = scanPane.appendChild(document.createElement('div'))
    filterBar.className = 'cp-filter-bar'
    filterBar.style.display = 'none'
    const filterCountLbl = filterBar.appendChild(document.createElement('span'))
    filterCountLbl.className = 'cp-filter-count-lbl'
    const addAllBtn = filterBar.appendChild(document.createElement('button'))
    addAllBtn.className = 'cp-dom-rb'
    addAllBtn.title = '将筛选结果中所有可操作元素批量加入流程'
    addAllBtn.textContent = '＋全部加入流程'
    addAllBtn.addEventListener('click', () => {
      const items = collectFilteredOperable(domTree)
      if (!items.length) return
      const id = mkFlowId()
      const ts = new Date().toLocaleString('zh-CN', { hour: 'numeric', minute: 'numeric' })
      flows.push({
        id, name: `批量 ${ts}`,
        steps: items.map((item, i) => ({
          id: `s_${Date.now() + i}_${Math.random().toString(36).slice(2, 6)}`,
          type: item.kind === 'input' ? 'input' : item.kind === 'select' ? 'select' : 'click',
          label: item.label,
          selector: item.selector,
          delay: [800, 2000],
        })),
      })
      activeFlowId = id
      selectedStepIds.clear()
      lastClickedStepId = null
      addAllBtn.textContent = `✓ 已新建 ${items.length} 步`
      setTimeout(() => {
        addAllBtn.textContent = '＋全部加入流程'
        switchTab('flow')
      }, 800)
    })

    const createLoopBtn = filterBar.appendChild(document.createElement('button'))
    createLoopBtn.className = 'cp-dom-rb'
    createLoopBtn.title = '以筛选结果创建循环步骤，然后在循环体内添加对每项的操作模板'
    createLoopBtn.textContent = '🔁 创建循环'
    createLoopBtn.addEventListener('click', () => {
      const items = collectFilteredOperable(domTree)
      if (!items.length) return
      // 根据筛选文本推断循环选择器
      let loopSelector = treeFilterText.trim()
      if (loopSelector && !/^[.#\[]/.test(loopSelector)) loopSelector = `.${loopSelector}`
      let loopCount = 0
      if (loopSelector) {
        try { loopCount = document.querySelectorAll(loopSelector).length } catch { loopSelector = '' }
      }
      if (!loopSelector || loopCount === 0) {
        loopSelector = items[0].selector.cssSelector
        try { loopCount = document.querySelectorAll(loopSelector).length } catch { loopCount = items.length }
      }
      ensureActiveFlow()
      const loopStep: FlowStep = {
        id: mkStepId(),
        type: 'loop_items',
        label: `循环 ${loopSelector} ×${loopCount}`,
        selector: { cssSelector: loopSelector },
        children: [],
        delay: [800, 2000],
      }
      activeFlow()!.steps.push(loopStep)
      selectedStepIds.clear()
      lastClickedStepId = null
      createLoopBtn.textContent = `✓ 已创建 ×${loopCount}`
      setTimeout(() => {
        createLoopBtn.textContent = '🔁 创建循环'
        switchTab('flow')
      }, 800)
    })

    // 选中元素（底部操作栏用）
    // selectedEl / selectedItem 已提升到外部作用域，此处不再重新声明

    // ── 置信度过滤 ───────────────────────────────────────────────────────────
    const confFilters = scanPane.appendChild(document.createElement('div'))
    confFilters.className = 'cp-scan-filters'

    const confLbl = confFilters.appendChild(document.createElement('span'))
    confLbl.className = 'cp-filter-group-lbl'
    confLbl.textContent = '显示：'

    const confOptions = [
      { value: 'all',       label: '全部节点' },
      { value: 'suspected', label: '疑似可操作' },
      { value: 'confirmed', label: '确定可操作' },
    ]
    const confBtns: HTMLElement[] = []
    confOptions.forEach(opt => {
      const btn = confFilters.appendChild(document.createElement('button'))
      btn.className = 'cp-filter-btn' + (opt.value === treeFilterConf ? ' cp-filter-btn--on' : '')
      btn.textContent = opt.label
      btn.addEventListener('click', () => {
        treeFilterConf = opt.value
        confBtns.forEach(b => b.classList.remove('cp-filter-btn--on'))
        btn.classList.add('cp-filter-btn--on')
        renderTree()
      })
      confBtns.push(btn)
    })

    // ── 类型过滤 ─────────────────────────────────────────────────────────────
    const kindFilters = scanPane.appendChild(document.createElement('div'))
    kindFilters.className = 'cp-scan-filters'

    const kindLbl = kindFilters.appendChild(document.createElement('span'))
    kindLbl.className = 'cp-filter-group-lbl'
    kindLbl.textContent = '类型：'

    const kindOptions = [
      { value: 'all',    label: '全部' },
      { value: 'click',  label: '🖱 点击' },
      { value: 'input',  label: '⌨ 输入' },
      { value: 'select', label: '📋 选择' },
    ]
    const kindBtns: HTMLElement[] = []
    kindOptions.forEach(opt => {
      const btn = kindFilters.appendChild(document.createElement('button'))
      btn.className = 'cp-filter-btn' + (opt.value === treeFilterKind ? ' cp-filter-btn--on' : '')
      btn.textContent = opt.label
      btn.addEventListener('click', () => {
        treeFilterKind = opt.value
        kindBtns.forEach(b => b.classList.remove('cp-filter-btn--on'))
        btn.classList.add('cp-filter-btn--on')
        renderTree()
      })
      kindBtns.push(btn)
    })

    // ── DOM 树容器 ────────────────────────────────────────────────────────────
    const treeContainer = scanPane.appendChild(document.createElement('div'))
    treeContainer.className = 'cp-tree'

    treeContainer.addEventListener('mouseleave', clearHoverHl)

    const isFiltering = () => treeFilterConf !== 'all' || treeFilterKind !== 'all' || treeFilterText !== ''

    function nodeMatchesTextFilter(node: DomNode): boolean {
      if (!treeFilterText) return true
      const q = treeFilterText.toLowerCase()
      const tag = node.el.tagName.toLowerCase()
      const id  = node.el.id.toLowerCase()
      const cls = [...node.el.classList].join(' ').toLowerCase()
      const sel = node.item?.selector.cssSelector.toLowerCase() ?? ''
      return tag.includes(q) || id.includes(q) || cls.includes(q) || sel.includes(q)
    }

    function nodeMatchesFilter(node: DomNode): boolean {
      const item = node.item
      if (treeFilterConf === 'suspected' && !item) return false
      if (treeFilterConf === 'confirmed' && item?.confidence !== 'high') return false
      if (treeFilterKind !== 'all' && item?.kind !== treeFilterKind) return false
      if (!nodeMatchesTextFilter(node)) return false
      return true
    }

    function hasMatchingDescendant(node: DomNode): boolean {
      return node.children.some(c => nodeMatchesFilter(c) || hasMatchingDescendant(c))
    }

    function collectFilteredOperable(nodes: DomNode[]): ScannedElement[] {
      const result: ScannedElement[] = []
      const walk = (ns: DomNode[]) => {
        ns.forEach(n => {
          if (nodeMatchesFilter(n) && n.item) result.push(n.item)
          walk(n.children)
        })
      }
      walk(nodes)
      return result
    }

    function renderNode(node: DomNode, container: HTMLElement, ancestors: DomNode[]): void {
      const filtering = isFiltering()
      const directMatch = !filtering || nodeMatchesFilter(node)
      const ancestorCtx = !directMatch && hasMatchingDescendant(node)

      // 过滤模式下，自身和后代均不匹配 → 完全跳过
      if (filtering && !directMatch && !ancestorCtx) return

      const isCollapsed = !filtering && collapsedNodes.has(node.el)
      const hasChildren = node.children.length > 0

      // ── 节点行 ──────────────────────────────────────────────────────────────
      const row = container.appendChild(document.createElement('div'))
      const pickable = treePickMode && (!treePickMode.filter || treePickMode.filter(node.el))
      row.className = 'cp-tree-row'
        + (ancestorCtx ? ' cp-tree-row--ancestor' : '')
        + (hasChildren && !filtering ? ' cp-tree-row--clickable' : '')
        + (node.el === selectedEl ? ' cp-tree-row--selected' : '')
        + (treePickMode ? (pickable ? ' cp-tree-row--pickable' : ' cp-tree-row--pick-disabled') : '')
      row.style.paddingLeft = `${4 + node.depth * 13}px`

      // 悬浮高亮（临时蓝色）
      row.addEventListener('mouseenter', () => showHoverHl(node.el))
      row.addEventListener('mouseleave', clearHoverHl)

      // 点击行：记录选中状态 + 持久高亮 + 展开/收起
      row.addEventListener('click', () => {
        if (treePickMode) {
          if (treePickMode.filter && !treePickMode.filter(node.el)) {
            // 超出允许范围：行闪烁红色提示
            row.style.outline = '2px solid #f38ba8'
            row.style.background = 'rgba(243,139,168,.15)'
            setTimeout(() => { row.style.outline = ''; row.style.background = '' }, 600)
            return
          }
          const cb = treePickMode.onPick
          treePickMode = null
          renderTree()
          cb(node.el)
          return
        }
        selectedEl = node.el
        selectedItem = node.item
        showSelectedHl(node.el)
        if (hasChildren && !filtering) {
          if (collapsedNodes.has(node.el)) collapsedNodes.delete(node.el)
          else collapsedNodes.add(node.el)
        }
        renderTree()
      })

      // 展开 / 收起状态图标（用同一字符 + CSS 旋转，视觉大小一致）
      const toggleBtn = row.appendChild(document.createElement('span'))
      if (hasChildren) {
        toggleBtn.className = 'cp-tree-toggle' + (isCollapsed ? '' : ' cp-tree-toggle--open')
        toggleBtn.textContent = '▶'
      } else {
        toggleBtn.className = 'cp-tree-toggle cp-tree-leaf'
        toggleBtn.textContent = '·'
      }

      // 标签名
      const tagEl = row.appendChild(document.createElement('span'))
      tagEl.className = 'cp-tree-tag'
      tagEl.textContent = node.el.tagName.toLowerCase()

      // id / 前两个 class（精简显示）
      const idPart  = node.el.id ? `#${node.el.id}` : ''
      const clsPart = [...node.el.classList].slice(0, 2).map(c => `.${c}`).join('')
      const metaStr = (idPart + clsPart).slice(0, 28)
      if (metaStr) {
        const metaEl = row.appendChild(document.createElement('span'))
        metaEl.className = 'cp-tree-meta'
        metaEl.textContent = metaStr
      }

      // 可操作性标注徽章
      if (node.item) {
        const badge = row.appendChild(document.createElement('span'))
        badge.className = `cp-kind-badge cp-kind-badge--${node.item.confidence}`
        badge.textContent = kindIcon(node.item.kind)
        badge.title = `疑似 ${node.item.kind}（置信度：${node.item.confidence}）`
        if (node.item.matchCount > 1) {
          const mc = badge.appendChild(document.createElement('span'))
          mc.textContent = ` ×${node.item.matchCount}`
          mc.style.fontSize = '9px'
        }
      }

      // 弹性空白
      const spacer = row.appendChild(document.createElement('span'))
      spacer.className = 'cp-tree-spacer'

      // 只展开它 / 展开全部子元素（有子节点时，悬浮显示）
      if (hasChildren) {
        // ⊙ 只展开它：折叠所有其他节点，只保留到当前节点的路径
        const soloBtn = row.appendChild(document.createElement('button'))
        soloBtn.className = 'cp-icon-btn cp-tree-btn'
        soloBtn.title = '只展开它（折叠其余）'
        soloBtn.textContent = '⊙'
        soloBtn.addEventListener('click', e => {
          e.stopPropagation()
          const collapseAll = (nodes: DomNode[]) => {
            nodes.forEach(n => { collapsedNodes.add(n.el); collapseAll(n.children) })
          }
          collapseAll(domTree)
          ancestors.forEach(a => collapsedNodes.delete(a.el))
          collapsedNodes.delete(node.el)
          renderTree()
        })

        // ⊞ 展开全部子元素：递归展开此节点下所有后代
        const expandBtn = row.appendChild(document.createElement('button'))
        expandBtn.className = 'cp-icon-btn cp-tree-btn'
        expandBtn.title = '展开全部子元素'
        expandBtn.textContent = '⊞'
        expandBtn.addEventListener('click', e => {
          e.stopPropagation()
          const expandAll = (nodes: DomNode[]) => {
            nodes.forEach(n => { collapsedNodes.delete(n.el); expandAll(n.children) })
          }
          expandAll([node])
          renderTree()
        })
      }

      // 加入流程按钮（仅限有可操作分类的节点）
      if (node.item) {
        // 📌 把选择器填入搜索框
        const pinBtn = row.appendChild(document.createElement('button'))
        pinBtn.className = 'cp-icon-btn cp-tree-btn'
        pinBtn.title = '填入选择器到筛选框'
        pinBtn.textContent = '📌'
        pinBtn.addEventListener('click', e => {
          e.stopPropagation()
          // 填入第一个 class，便于找同类元素；无 class 则退为标签名
          const classes = [...node.el.classList]
          treeFilterText = classes.length > 0 ? classes[0] : node.el.tagName.toLowerCase()
          searchInput.value = treeFilterText
          renderTree()
        })

        // 👆 模拟点击（测试可点击性）
        if (node.item.kind === 'click' || node.item.kind === 'unknown') {
          const clickBtn = row.appendChild(document.createElement('button'))
          clickBtn.className = 'cp-icon-btn cp-tree-btn'
          clickBtn.title = '模拟点击（测试）'
          clickBtn.textContent = '👆'
          clickBtn.addEventListener('click', e => {
            e.stopPropagation()
            try {
              ;(node.el as HTMLElement).click()
              clickBtn.textContent = '✓'
              setTimeout(() => { clickBtn.textContent = '👆' }, 800)
            } catch { /* 忽略 */ }
          })
        }

        const addBtn = row.appendChild(document.createElement('button'))
        addBtn.className = 'cp-icon-btn cp-icon-btn--primary cp-tree-btn'
        addBtn.title = '加入流程'
        addBtn.textContent = '＋'
        addBtn.addEventListener('click', e => { e.stopPropagation(); openStepBuilder(node.item!) })
      }

      // 递归子节点（过滤模式下强制展开以显示匹配后代）
      if (hasChildren && (filtering || !isCollapsed)) {
        node.children.forEach(child => renderNode(child, container, [...ancestors, node]))
      }
    }

    function renderTree(): void {
      treeContainer.innerHTML = ''

      // ── DOM 树拾取模式 banner ────────────────────────────────────────────────
      if (treePickMode) {
        const banner = treeContainer.appendChild(document.createElement('div'))
        banner.className = 'cp-tree-pick-banner'
        const msg = banner.appendChild(document.createElement('span'))
        msg.className = 'cp-tree-pick-msg'
        msg.textContent = `🎯 ${treePickMode.label}`
        const cancelPickBtn = banner.appendChild(document.createElement('button'))
        cancelPickBtn.className = 'cp-builder-btn'
        cancelPickBtn.textContent = '取消'
        cancelPickBtn.addEventListener('click', e => {
          e.stopPropagation()
          const cb = treePickMode!.onCancel
          treePickMode = null
          renderTree()
          cb()
        })
      }

      // 统计总节点数与可操作节点数
      let totalNodes = 0, operable = 0
      const count = (nodes: DomNode[]) => {
        nodes.forEach(n => { totalNodes++; if (n.item) operable++; count(n.children) })
      }
      count(domTree)
      statsLbl.textContent = `${totalNodes} 节点 · ${operable} 个疑似可操作`

      if (!domTree.length) {
        const empty = treeContainer.appendChild(document.createElement('div'))
        empty.className = 'cp-empty'
        empty.textContent = '请点击"重新扫描"来分析当前页面的 DOM 结构。'
        filterBar.style.display = 'none'
        return
      }

      domTree.forEach(node => renderNode(node, treeContainer, []))

      // ── 筛选批量操作栏状态更新 ───────────────────────────────────────────────
      if (isFiltering()) {
        const filteredOp = collectFilteredOperable(domTree)
        filterBar.style.display = filteredOp.length > 0 ? 'flex' : 'none'
        filterCountLbl.textContent = `筛选到 ${filteredOp.length} 个可操作元素`
      } else {
        filterBar.style.display = 'none'
      }

      // ── 选中元素底部操作栏 ──────────────────────────────────────────────────
      selectedActionBar.style.display = (selectedEl && selectedItem) ? 'flex' : 'none'
      if (selectedEl && selectedItem) {
        selectedActionLbl.textContent = selectedItem.label.slice(0, 32)
      }

      // 滚动到选中行
      if (selectedEl) {
        const selRow = treeContainer.querySelector<HTMLElement>('.cp-tree-row--selected')
        if (selRow) setTimeout(() => selRow.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 0)
      }
    }

    // ── 选中元素底部快捷栏 ────────────────────────────────────────────────────
    const selectedActionBar = scanPane.appendChild(document.createElement('div'))
    selectedActionBar.className = 'cp-sel-bar'
    selectedActionBar.style.display = 'none'

    const selectedActionLbl = selectedActionBar.appendChild(document.createElement('span'))
    selectedActionLbl.className = 'cp-sel-bar-lbl'

    const selectedActionAdd = selectedActionBar.appendChild(document.createElement('button'))
    selectedActionAdd.className = 'cp-dom-rb cp-sel-bar-add'
    selectedActionAdd.textContent = '＋ 加入流程'
    selectedActionAdd.addEventListener('click', () => {
      if (selectedItem) openStepBuilder(selectedItem)
    })

    renderTree()
    triggerTreeRenderAndScroll = () => renderTree()
  }
  function openStepBuilder(item: ScannedElement): void {
    shadow.getElementById('fp-step-builder')?.remove()

    const overlay = shadow.appendChild(document.createElement('div'))
    overlay.id = 'fp-step-builder'
    overlay.className = 'cp-overlay'

    const card = overlay.appendChild(document.createElement('div'))
    card.className = 'cp-builder-card'

    const title = card.appendChild(document.createElement('div'))
    title.className = 'cp-builder-title'
    title.textContent = '配置步骤'

    const elInfo = card.appendChild(document.createElement('div'))
    elInfo.className = 'cp-builder-info'

    const elLbl = elInfo.appendChild(document.createElement('span'))
    elLbl.className = 'cp-builder-lbl'
    elLbl.textContent = item.label

    if (item.matchCount > 1) {
      const warn = elInfo.appendChild(document.createElement('span'))
      warn.className = 'cp-builder-warn'
      warn.textContent = `⚠ 匹配 ${item.matchCount} 个元素，建议使用循环步骤`
    }

    const elSel = card.appendChild(document.createElement('div'))
    elSel.className = 'cp-builder-sel'
    elSel.textContent = item.selector.cssSelector

    // 动作类型
    const actionRow = card.appendChild(document.createElement('div'))
    actionRow.className = 'cp-builder-row'
    const actionLblEl = actionRow.appendChild(document.createElement('label'))
    actionLblEl.className = 'cp-builder-field-lbl'
    actionLblEl.textContent = '动作'

    const actionSel = actionRow.appendChild(document.createElement('select'))
    actionSel.className = 'cp-builder-select'

    const isCanvas = item.el.tagName.toLowerCase() === 'canvas'
    const defaultAction = isCanvas                ? 'save_canvas'
                        : item.kind === 'input'  ? 'input'
                        : item.kind === 'select' ? 'select'
                        : item.matchCount > 1    ? 'loop_items'
                        :                          'click'

    const actionOptions = [
      { value: 'click',          label: '▶ 点击' },
      { value: 'input',          label: '⌨ 输入文字' },
      { value: 'select',         label: '📋 选择选项' },
      { value: 'get_text',       label: '📝 获取文本' },
      { value: 'loop_items',     label: '🔄 循环每个子项' },
      { value: 'wait_appear',    label: '⏳ 等待出现' },
      { value: 'wait_disappear', label: '⌛ 等待消失' },
      { value: 'scroll_to',      label: '📜 滚动到此处' },
      { value: 'focus',          label: '🎯 获取焦点' },
      ...(isCanvas ? [{ value: 'save_canvas', label: '🖼 保存为图片' }] : []),
    ]
    actionOptions.forEach(opt => {
      const o = actionSel.appendChild(document.createElement('option'))
      o.value = opt.value
      o.textContent = opt.label
      if (opt.value === defaultAction) o.selected = true
    })

    // 值输入
    const valueRow = card.appendChild(document.createElement('div'))
    valueRow.className = 'cp-builder-row'
    const valueLblEl = valueRow.appendChild(document.createElement('label'))
    valueLblEl.className = 'cp-builder-field-lbl'
    valueLblEl.textContent = '值'
    const valueInput = valueRow.appendChild(document.createElement('input'))
    valueInput.className = 'cp-builder-input'
    valueInput.placeholder = '留空则运行时从变量读取'

    // 步骤名
    const nameRow = card.appendChild(document.createElement('div'))
    nameRow.className = 'cp-builder-row'
    const nameLblEl = nameRow.appendChild(document.createElement('label'))
    nameLblEl.className = 'cp-builder-field-lbl'
    nameLblEl.textContent = '步骤名'
    const nameInput = nameRow.appendChild(document.createElement('input'))
    nameInput.className = 'cp-builder-input'
    nameInput.value = defaultStepName(defaultAction, item)

    // 添加到循环体
    const loopSteps = activeSteps().filter(s => s.type === 'loop_items')
    const conditionSteps = activeSteps().filter(s => s.type === 'condition')
    const loopRow = card.appendChild(document.createElement('div'))
    loopRow.className = 'cp-builder-row'
    const loopLblEl = loopRow.appendChild(document.createElement('label'))
    loopLblEl.className = 'cp-builder-field-lbl'
    loopLblEl.textContent = '添加到'
    const loopSel = loopRow.appendChild(document.createElement('select'))
    loopSel.className = 'cp-builder-select'
    const rootOpt = loopSel.appendChild(document.createElement('option'))
    rootOpt.value = '__root__'
    rootOpt.textContent = '顶层流程'
    loopSteps.forEach(ls => {
      const o = loopSel.appendChild(document.createElement('option'))
      o.value = ls.id
      o.textContent = `↳ 循环体：${ls.label}`
    })
    conditionSteps.forEach(cs => {
      const thenOpt = loopSel.appendChild(document.createElement('option'))
      thenOpt.value = `cond:${cs.id}:then`
      thenOpt.textContent = `→ 成立时：${cs.label}`
      const elseOpt = loopSel.appendChild(document.createElement('option'))
      elseOpt.value = `cond:${cs.id}:else`
      elseOpt.textContent = `→ 否则：${cs.label}`
    })
    if (!loopSteps.length && !conditionSteps.length) loopRow.style.display = 'none'
    // 若有挂起的分支目标，自动预选
    if (pendingConditionTarget) {
      const pt = pendingConditionTarget
      loopSel.value = `cond:${pt.stepId}:${pt.branch}`
      pendingConditionTarget = null
    }
    if (pendingLoopChildTarget) {
      loopSel.value = pendingLoopChildTarget
      pendingLoopChildTarget = null
    }

    const updateValueRow = () => {
      const t = actionSel.value
      if (t === 'input' || t === 'select') {
        valueRow.style.display = 'flex'
        valueLblEl.textContent = '值'
        valueInput.placeholder = '留空则运行时从变量读取'
      } else if (t === 'get_text') {
        valueRow.style.display = 'flex'
        valueLblEl.textContent = '存为变量'
        valueInput.placeholder = '变量名，如 age（后续用 {{age}} 引用）'
      } else {
        valueRow.style.display = 'none'
        valueLblEl.textContent = '值'
      }
      nameInput.value = defaultStepName(t, item)
    }
    actionSel.addEventListener('change', updateValueRow)
    updateValueRow()

    // 步骤后延迟
    const delayRow = card.appendChild(document.createElement('div'))
    delayRow.className = 'cp-builder-row'
    const delayLblEl = delayRow.appendChild(document.createElement('label'))
    delayLblEl.className = 'cp-builder-field-lbl'
    delayLblEl.textContent = '延迟'
    const delaySel = delayRow.appendChild(document.createElement('select'))
    delaySel.className = 'cp-builder-select'
    ;[
      { label: '无',             v: '' },
      { label: '短 (0.5–1.5s)', v: '500,1500' },
      { label: '中 (1–3s)',      v: '1000,3000' },
      { label: '长 (3–6s)',      v: '3000,6000' },
    ].forEach(opt => {
      const o = delaySel.appendChild(document.createElement('option'))
      o.value = opt.v
      o.textContent = opt.label
    })
    delaySel.value = '1000,3000'

    // 按钮
    const btnRow = card.appendChild(document.createElement('div'))
    btnRow.className = 'cp-builder-btns'

    const cancelBtn = btnRow.appendChild(document.createElement('button'))
    cancelBtn.className = 'cp-builder-btn'
    cancelBtn.textContent = '取消'
    cancelBtn.addEventListener('click', () => overlay.remove())

    const confirmBtn = btnRow.appendChild(document.createElement('button'))
    confirmBtn.className = 'cp-builder-btn cp-builder-btn--primary'
    confirmBtn.textContent = '加入流程'
    confirmBtn.addEventListener('click', () => {
      const step: FlowStep = {
        id: `s_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: actionSel.value as FlowStep['type'],
        label: nameInput.value.trim() || defaultStepName(actionSel.value, item),
        selector: item.selector,
        value: valueInput.value.trim() || undefined,
        children: actionSel.value === 'loop_items' ? [] : undefined,
        delay: delaySel.value ? delaySel.value.split(',').map(Number) as [number, number] : undefined,
      }

      ensureActiveFlow()
      const steps = activeFlow()!.steps
      const targetId = loopSel.value
      if (targetId === '__root__') {
        steps.push(step)
      } else if (targetId.startsWith('cond:')) {
        const parts = targetId.split(':')
        const condId = parts[1]
        const branch = parts[2] as 'then' | 'else'
        const parent = findStep(steps, condId)
        if (parent) {
          if (branch === 'then') {
            parent.children = parent.children ?? []
            parent.children.push(step)
          } else {
            parent.elseChildren = parent.elseChildren ?? []
            parent.elseChildren.push(step)
          }
        } else {
          steps.push(step)
        }
      } else {
        const parent = findStep(steps, targetId)
        if (parent) {
          parent.children = parent.children ?? []
          parent.children.push(step)
        } else {
          steps.push(step)
        }
      }

      overlay.remove()
      switchTab('flow')
    })

    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
  }

  function persistFlows(): void {
    if (!flowsReady) return
    const toSave = flows.filter(f => !draftFlowIds.has(f.id))
    chrome.runtime.sendMessage({ type: 'SYNC_FLOWS', flows: toSave }).catch(() => {})
  }

  async function loadFlowsAndRender(): Promise<void> {
    if (!flowsReady) {
      try {
        const res = await chrome.runtime.sendMessage({ type: 'GET_BUILT_FLOWS' }) as
          { ok: boolean; flows: LocalFlow[] }
        if (Array.isArray(res?.flows) && res.flows.length) {
          const storageIds = new Set(res.flows.map(f => f.id))
          const localOnly = flows.filter(f => !storageIds.has(f.id))
          flows = [...res.flows, ...localOnly]
        }
      } catch { /* keep current */ }
      flowsReady = true
    }
    renderFlowPane()
  }

  // ── Flow Pane ──────────────────────────────────────────────────────────────
  function renderFlowPane(): void {
    persistFlows()
    flowPane.innerHTML = ''
    if (activeFlowId === null) renderFlowList()
    else renderFlowDetail()
  }

  function renderFlowList(): void {
    setHdrBack(null)
    inlineLogContainer = null
    const bar = flowPane.appendChild(document.createElement('div'))
    bar.className = 'cp-flow-bar'

    const titleLbl = bar.appendChild(document.createElement('span'))
    titleLbl.className = 'cp-flow-title'
    titleLbl.textContent = `${flows.length} 个流程`

    const newFlowBtn = bar.appendChild(document.createElement('button'))
    newFlowBtn.className = 'cp-flow-act-btn cp-flow-act-btn--run'
    newFlowBtn.textContent = '＋ 新建流程'
    newFlowBtn.addEventListener('click', () => {
      const id = mkFlowId()
      flows.push({ id, name: `流程 ${flows.length + 1}`, steps: [] })
      draftFlowIds.add(id)
      activeFlowId = id
      selectedStepIds.clear()
      lastClickedStepId = null
      renderFlowPane()
    })

    const list = flowPane.appendChild(document.createElement('div'))
    list.className = 'cp-flow-list'

    if (!flows.length) {
      const empty = list.appendChild(document.createElement('div'))
      empty.className = 'cp-empty'
      empty.textContent = '暂无流程。点击「＋ 新建流程」，或「🔍 元素」扫描页面批量加入。'
    } else {
      flows.forEach(flow => {
        const row = list.appendChild(document.createElement('div'))
        row.className = 'cp-flow-project-row'

        const clickArea = row.appendChild(document.createElement('div'))
        clickArea.className = 'cp-flow-project-info'
        clickArea.addEventListener('click', () => {
          activeFlowId = flow.id
          selectedStepIds.clear()
          lastClickedStepId = null
          renderFlowPane()
        })

        const nameEl = clickArea.appendChild(document.createElement('span'))
        nameEl.className = 'cp-flow-project-name'
        nameEl.textContent = flow.name

        const metaEl = clickArea.appendChild(document.createElement('span'))
        metaEl.className = 'cp-flow-project-meta'
        metaEl.textContent = `${flow.steps.length} 步`

        const acts = row.appendChild(document.createElement('div'))
        acts.className = 'cp-step-acts'

        const pinBtn = acts.appendChild(document.createElement('button'))
        pinBtn.className = 'cp-icon-btn cp-pin-btn' + (flow.pinnedInMenu ? ' cp-pin-btn--on' : '')
        pinBtn.title = flow.pinnedInMenu ? '从快捷菜单移除' : '加入快捷菜单'
        pinBtn.textContent = flow.pinnedInMenu ? '★' : '☆'
        pinBtn.addEventListener('click', (e) => {
          e.stopPropagation()
          flow.pinnedInMenu = !flow.pinnedInMenu
          persistFlows()
          renderFlowPane()
        })

        const runBtn = acts.appendChild(document.createElement('button'))
        runBtn.className = 'cp-icon-btn'
        runBtn.title = '运行'
        runBtn.textContent = '▶'
        runBtn.addEventListener('click', () => {
          activeFlowId = flow.id
          logSectionOpen = true
          loadFlowsAndRender()
          runFlow(flow.steps, {}, text => {
            chrome.runtime.sendMessage({ type: 'FLOW_LOG', text }).catch(() => {})
          })
        })

        const delBtn = acts.appendChild(document.createElement('button'))
        delBtn.className = 'cp-icon-btn cp-icon-btn--danger'
        delBtn.title = '删除'
        delBtn.textContent = '✕'
        delBtn.addEventListener('click', () => {
          flows = flows.filter(f => f.id !== flow.id)
          renderFlowPane()
        })
      })
    }
  }

  function renderFlowDetail(): void {
    const flow = activeFlow()
    if (!flow) { activeFlowId = null; renderFlowPane(); return }

    const isDraft = draftFlowIds.has(flow.id)

    setHdrBack(() => {
      if (isDraft) {
        flows = flows.filter(f => f.id !== flow.id)
        draftFlowIds.delete(flow.id)
      }
      activeFlowId = null
      selectedStepIds.clear()
      lastClickedStepId = null
      renderFlowPane()
    })

    // ── Row 1: 流程名称 + 保存（草稿时）──────────────────────────────────────
    const bar = flowPane.appendChild(document.createElement('div'))
    bar.className = 'cp-flow-bar'

    const nameInp = bar.appendChild(document.createElement('input'))
    nameInp.className = 'cp-flow-name-inp'
    nameInp.value = flow.name
    nameInp.addEventListener('change', () => { flow.name = nameInp.value.trim() || flow.name; if (!isDraft) persistFlows() })

    if (isDraft) {
      const saveBtn = bar.appendChild(document.createElement('button'))
      saveBtn.className = 'cp-flow-act-btn cp-flow-act-btn--save'
      saveBtn.textContent = '保存'
      saveBtn.addEventListener('click', () => {
        flow.name = nameInp.value.trim() || flow.name
        draftFlowIds.delete(flow.id)
        persistFlows()
        renderFlowPane()
      })
    }

    // ── Row 2: 新增步骤（下拉菜单）──────────────────────────────────────────
    const actionRow = flowPane.appendChild(document.createElement('div'))
    actionRow.className = 'cp-flow-toolbar-row'

    const addStepWrap = actionRow.appendChild(document.createElement('div'))
    addStepWrap.className = 'cp-add-step-wrap'

    const addStepBtn = addStepWrap.appendChild(document.createElement('button'))
    addStepBtn.className = 'cp-flow-act-btn cp-add-step-btn'
    addStepBtn.textContent = '＋ 新增步骤 ▾'
    addStepBtn.title = '新增步骤'

    const addStepMenu = addStepWrap.appendChild(document.createElement('div'))
    addStepMenu.className = 'cp-add-step-menu'
    addStepMenu.style.display = 'none'

    const addStepItems: { icon: string; label: string; title: string; action: () => void }[] = [
      { icon: '🎯', label: '选择元素',  title: '扫描页面元素，拾取后可加入当前流程',             action: () => switchTab('scan') },
      { icon: '🔁', label: '新建循环',  title: '向导式三步创建循环：选列表项 → 选动作元素 → 确认层级', action: () => openLoopWizardPicker(flow) },
      { icon: '❓', label: '条件判断',  title: '新增条件判断步骤，根据变量値走不同分支',          action: () => openConditionBuilder(flow) },
      { icon: '🔀', label: '嵌入流程',  title: '将已保存的流程嵌入当前流程',                      action: () => openEmbedFlowPicker(flow) },
    ]
    addStepItems.forEach(({ icon, label, title, action }) => {
      const item = addStepMenu.appendChild(document.createElement('button'))
      item.className = 'cp-add-step-item'
      item.title = title
      const iconEl = item.appendChild(document.createElement('span'))
      iconEl.className = 'cp-add-step-item-icon'
      iconEl.textContent = icon
      const labelEl = item.appendChild(document.createElement('span'))
      labelEl.textContent = label
      item.addEventListener('click', () => {
        addStepMenu.style.display = 'none'
        action()
      })
    })

    addStepBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      const isOpen = addStepMenu.style.display !== 'none'
      addStepMenu.style.display = isOpen ? 'none' : 'block'
    })

    const closeAddStepMenu = (e: Event) => {
      if (!addStepWrap.contains(e.target as Node)) {
        addStepMenu.style.display = 'none'
      }
    }
    shadow.addEventListener('click', closeAddStepMenu)

    // ── Row 3: 运行 ──────────────────────────────────────────────────────────
    const runRow = flowPane.appendChild(document.createElement('div'))
    runRow.className = 'cp-flow-toolbar-row'

    const runBtn = runRow.appendChild(document.createElement('button'))
    runBtn.className = 'cp-flow-act-btn cp-flow-act-btn--run'
    runBtn.textContent = '▶ 运行'
    runBtn.disabled = flow.steps.length === 0 || isDraft
    runBtn.addEventListener('click', () => {
      logSectionOpen = true
      renderFlowPane()
      runFlow(flow.steps, {}, text => {
        chrome.runtime.sendMessage({ type: 'FLOW_LOG', text }).catch(() => {})
      })
    })

    // ── Row 4: 选中操作（全选 / 删除选中）────────────────────────────────────
    const selRow = flowPane.appendChild(document.createElement('div'))
    selRow.className = 'cp-flow-toolbar-row'

    const allStepIds = (): string[] => {
      const ids: string[] = []
      const collect = (steps: FlowStep[]) => steps.forEach(s => { ids.push(s.id); if (s.children) collect(s.children); if (s.elseChildren) collect(s.elseChildren) })
      collect(flow.steps)
      return ids
    }
    const allIds = allStepIds()
    const allSelected = allIds.length > 0 && allIds.every(id => selectedStepIds.has(id))

    const selectAllBtn = selRow.appendChild(document.createElement('button'))
    selectAllBtn.className = 'cp-flow-act-btn'
    selectAllBtn.textContent = allSelected ? '取消全选' : '全选'
    selectAllBtn.disabled = flow.steps.length === 0
    selectAllBtn.addEventListener('click', () => {
      if (allSelected) { selectedStepIds.clear() }
      else { allStepIds().forEach(id => selectedStepIds.add(id)) }
      lastClickedStepId = null
      renderFlowPane()
    })

    const batchDelBtn = selRow.appendChild(document.createElement('button'))
    batchDelBtn.className = 'cp-flow-act-btn'
    batchDelBtn.disabled = selectedStepIds.size === 0
    batchDelBtn.textContent = selectedStepIds.size > 0 ? `删除选中 (${selectedStepIds.size})` : '删除选中'
    batchDelBtn.addEventListener('click', () => {
      if (!selectedStepIds.size) return
      const removeFrom = (arr: FlowStep[]): FlowStep[] =>
        arr.filter(s => !selectedStepIds.has(s.id)).map(s => ({
          ...s,
          children: s.children ? removeFrom(s.children) : undefined,
          elseChildren: s.elseChildren ? removeFrom(s.elseChildren) : undefined,
        }))
      flow.steps = removeFrom(flow.steps)
      selectedStepIds.clear()
      lastClickedStepId = null
      renderFlowPane()
    })

    // ── Row 5: 全局等待 ───────────────────────────────────────────────────────
    const delayRow = flowPane.appendChild(document.createElement('div'))
    delayRow.className = 'cp-flow-toolbar-row'

    const globalDelaySel = delayRow.appendChild(document.createElement('select'))
    globalDelaySel.className = 'cp-flow-global-delay-sel'
    ;[
      { label: '全局等待…', val: '' },
      { label: '清除全部等待', val: 'none' },
      { label: '短 0.5–1.5s',  val: '500,1500' },
      { label: '中 1–3s',      val: '1000,3000' },
      { label: '长 3–6s',      val: '3000,6000' },
    ].forEach(({ label, val }) => {
      const o = globalDelaySel.appendChild(document.createElement('option'))
      o.value = val; o.textContent = label
    })
    globalDelaySel.addEventListener('change', () => {
      const val = globalDelaySel.value
      if (!val) return
      const delay = val === 'none' ? undefined : val.split(',').map(Number) as [number, number]
      const applyAll = (arr: FlowStep[]) => arr.forEach(s => {
        s.delay = delay
        if (s.children) applyAll(s.children)
      })
      applyAll(flow.steps)
      globalDelaySel.value = ''
      renderFlowPane()
    })

    const list = flowPane.appendChild(document.createElement('div'))
    list.className = 'cp-flow-list'

    if (!flow.steps.length) {
      const empty = list.appendChild(document.createElement('div'))
      empty.className = 'cp-empty'
      empty.textContent = '流程为空。点击「🔍 元素」扫描页面，拾取元素后可加入本流程。'
    } else {
      renderStepList(list, flow.steps, 0)
    }

    // ── 运行日志区（可折叠 + 拖拽调高）──────────────────────────────────
    let logH = Math.max(160, Math.round(window.innerHeight / 3))
    const logSection = flowPane.appendChild(document.createElement('div'))
    logSection.className = 'cp-log-section'

    // 拖拽条（在 header 上方）
    const logDragBar = logSection.appendChild(document.createElement('div'))
    logDragBar.className = 'cp-log-drag-bar'
    logDragBar.title = '拖拽调整日志高度';
    (() => {
      let dragging = false, startY = 0, startH = 0
      logDragBar.addEventListener('mousedown', (e) => {
        dragging = true; startY = e.clientY; startH = logH
        e.preventDefault()
      })
      document.addEventListener('mousemove', (e) => {
        if (!dragging) return
        logH = Math.max(80, Math.min(600, startH - (e.clientY - startY)))
        logBody.style.height = `${logH}px`
      })
      document.addEventListener('mouseup', () => { dragging = false })
    })()

    const logHdr = logSection.appendChild(document.createElement('div'))
    logHdr.className = 'cp-log-section-hdr'

    const logHdrTitle = logHdr.appendChild(document.createElement('span'))
    logHdrTitle.className = 'cp-log-section-title'
    logHdrTitle.textContent = '📋 运行日志'

    const logCopyBtn = logHdr.appendChild(document.createElement('button'))
    logCopyBtn.className = 'cp-log-clear-btn'
    logCopyBtn.textContent = '复制'
    logCopyBtn.addEventListener('click', async (e) => {
      e.stopPropagation()
      if (!lastRenderedLogs.length) return
      const text = lastRenderedLogs.join('\n')
      try {
        await navigator.clipboard.writeText(text)
      } catch {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        ta.remove()
      }
      logCopyBtn.textContent = '✓ 已复制'
      setTimeout(() => { logCopyBtn.textContent = '复制' }, 1500)
    })

    const logClearBtn = logHdr.appendChild(document.createElement('button'))
    logClearBtn.className = 'cp-log-clear-btn'
    logClearBtn.textContent = '清空'
    logClearBtn.addEventListener('click', async (e) => {
      e.stopPropagation()
      try { await chrome.runtime.sendMessage({ type: 'CLEAR_LOGS' }) } catch { /* ignore */ }
      fetchLogs()
    })

    const logBody = logSection.appendChild(document.createElement('div'))
    logBody.className = 'cp-log-body'
    logBody.style.height = `${logH}px`
    logBody.style.display = 'flex'
    inlineLogContainer = logBody

    if (logSectionOpen) fetchLogs()
  }

  function openEmbedFlowPicker(targetFlow: LocalFlow, targetSteps?: FlowStep[]): void {
    shadow.getElementById('fp-embed-picker')?.remove()

    const overlay = shadow.appendChild(document.createElement('div'))
    overlay.id = 'fp-embed-picker'
    overlay.className = 'cp-overlay'

    const card = overlay.appendChild(document.createElement('div'))
    card.className = 'cp-builder-card'

    const title = card.appendChild(document.createElement('div'))
    title.className = 'cp-builder-title'
    title.textContent = '🔀 嵌入已保存流程'

    const listEl = card.appendChild(document.createElement('div'))
    listEl.style.cssText = 'max-height:240px;overflow-y:auto;margin-bottom:8px'

    const embeddable = flows.filter(f => f.id !== targetFlow.id)
    if (!embeddable.length) {
      const empty = listEl.appendChild(document.createElement('div'))
      empty.className = 'cp-empty'
      empty.textContent = '暂无可嵌入的流程'
    } else {
      embeddable.forEach(saved => {
        const row = listEl.appendChild(document.createElement('div'))
        row.className = 'cp-saved-row'
        row.style.cursor = 'pointer'

        const info = row.appendChild(document.createElement('div'))
        info.className = 'cp-saved-info'

        const name = info.appendChild(document.createElement('span'))
        name.className = 'cp-saved-name'
        name.textContent = saved.name

        const meta = info.appendChild(document.createElement('span'))
        meta.className = 'cp-saved-meta'
        meta.textContent = `${saved.steps.length} 步`

        row.addEventListener('click', () => {
          const dest = targetSteps ?? targetFlow.steps
          dest.push({
            id: mkStepId(),
            type: 'call_flow',
            label: `嵌入：${saved.name}`,
            flowRef: saved.id,
          })
          overlay.remove()
          renderFlowPane()
        })
      })
    }

    const cancelBtn = card.appendChild(document.createElement('button'))
    cancelBtn.className = 'cp-builder-btn'
    cancelBtn.textContent = '取消'
    cancelBtn.addEventListener('click', () => overlay.remove())

    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
  }

  function openConditionBuilder(targetFlow: LocalFlow, targetSteps?: FlowStep[]): void {
    shadow.getElementById('fp-condition-builder')?.remove()
    const overlay = shadow.appendChild(document.createElement('div'))
    overlay.id = 'fp-condition-builder'
    overlay.className = 'cp-overlay'

    const card = overlay.appendChild(document.createElement('div'))
    card.className = 'cp-builder-card'

    const title = card.appendChild(document.createElement('div'))
    title.className = 'cp-builder-title'
    title.textContent = '❓ 配置条件判断'

    // ── 变量选择 ────────────────────────────────────────────────────────────
    const vars = collectVars(targetFlow.steps)

    const varRow = card.appendChild(document.createElement('div'))
    varRow.className = 'cp-builder-row'
    const varLbl = varRow.appendChild(document.createElement('label'))
    varLbl.className = 'cp-builder-field-lbl'
    varLbl.textContent = '变量'
    const varSel = varRow.appendChild(document.createElement('select'))
    varSel.className = 'cp-builder-select'
    vars.forEach(v => {
      const o = varSel.appendChild(document.createElement('option'))
      o.value = v
      o.textContent = `{{${v}}}`
    })
    const manualVarOpt = varSel.appendChild(document.createElement('option'))
    manualVarOpt.value = '__manual__'
    manualVarOpt.textContent = '手动输入…'
    if (!vars.length) manualVarOpt.selected = true

    // 手动输入框（当选"手动输入"时显示）
    const varManualRow = card.appendChild(document.createElement('div'))
    varManualRow.className = 'cp-builder-row'
    varManualRow.style.display = vars.length ? 'none' : 'flex'
    varRow.appendChild(document.createElement('span'))  // spacer handled by row
    const varManualLbl = varManualRow.appendChild(document.createElement('label'))
    varManualLbl.className = 'cp-builder-field-lbl'
    varManualLbl.textContent = ''
    const varManualInp = varManualRow.appendChild(document.createElement('input'))
    varManualInp.className = 'cp-builder-input'
    varManualInp.placeholder = '变量名，如 price（不含花括号）'

    varSel.addEventListener('change', () => {
      varManualRow.style.display = varSel.value === '__manual__' ? 'flex' : 'none'
      updateName()
    })

    // ── 运算符 ──────────────────────────────────────────────────────────────
    const opRow = card.appendChild(document.createElement('div'))
    opRow.className = 'cp-builder-row'
    const opLbl = opRow.appendChild(document.createElement('label'))
    opLbl.className = 'cp-builder-field-lbl'
    opLbl.textContent = '运算符'
    const opSel = opRow.appendChild(document.createElement('select'))
    opSel.className = 'cp-builder-select'
    ;[
      { value: '>',            label: '> 大于' },
      { value: '<',            label: '< 小于' },
      { value: '>=',           label: '>= 大于等于' },
      { value: '<=',           label: '<= 小于等于' },
      { value: '==',           label: '== 等于' },
      { value: '!=',           label: '!= 不等于' },
      { value: 'contains',     label: '包含文字' },
      { value: 'not_contains', label: '不包含文字' },
    ].forEach(opt => {
      const o = opSel.appendChild(document.createElement('option'))
      o.value = opt.value
      o.textContent = opt.label
    })

    // ── 比较值 ──────────────────────────────────────────────────────────────
    const cmpRow = card.appendChild(document.createElement('div'))
    cmpRow.className = 'cp-builder-row'
    const cmpLbl = cmpRow.appendChild(document.createElement('label'))
    cmpLbl.className = 'cp-builder-field-lbl'
    cmpLbl.textContent = '比较值'
    const cmpInp = cmpRow.appendChild(document.createElement('input'))
    cmpInp.className = 'cp-builder-input'
    cmpInp.placeholder = '如 100、18、已投递…'

    // ── 步骤名（自动生成）───────────────────────────────────────────────────
    const nameRow = card.appendChild(document.createElement('div'))
    nameRow.className = 'cp-builder-row'
    const nameLbl = nameRow.appendChild(document.createElement('label'))
    nameLbl.className = 'cp-builder-field-lbl'
    nameLbl.textContent = '步骤名'
    const nameInp = nameRow.appendChild(document.createElement('input'))
    nameInp.className = 'cp-builder-input'
    nameInp.placeholder = '条件判断'
    nameInp.value = '条件判断'

    function getVarName(): string {
      if (varSel.value !== '__manual__' && varSel.value !== '') return varSel.value
      return varManualInp.value.trim()
    }
    function updateName(): void {
      const v = getVarName() || 'x'
      nameInp.value = `{{${v}}} ${opSel.value} ${cmpInp.value.trim() || '?'}`
    }
    varManualInp.addEventListener('input', updateName)
    opSel.addEventListener('change', updateName)
    cmpInp.addEventListener('input', updateName)

    // ── 按钮 ────────────────────────────────────────────────────────────────
    const btnRow = card.appendChild(document.createElement('div'))
    btnRow.className = 'cp-builder-btns'

    const cancelBtn = btnRow.appendChild(document.createElement('button'))
    cancelBtn.className = 'cp-builder-btn'
    cancelBtn.textContent = '取消'
    cancelBtn.addEventListener('click', () => overlay.remove())

    const confirmBtn = btnRow.appendChild(document.createElement('button'))
    confirmBtn.className = 'cp-builder-btn cp-builder-btn--primary'
    confirmBtn.textContent = '加入流程'
    confirmBtn.addEventListener('click', () => {
      const varName = getVarName()
      const cmpVal = cmpInp.value.trim()
      if (!varName) {
        varManualInp.focus()
        varManualInp.style.borderColor = '#f38ba8'
        return
      }
      if (!cmpVal) {
        cmpInp.focus()
        cmpInp.style.borderColor = '#f38ba8'
        return
      }
      const expr = `{{${varName}}} ${opSel.value} ${cmpVal}`
      const step: FlowStep = {
        id: mkStepId(),
        type: 'condition',
        label: nameInp.value.trim() || expr,
        value: expr,
        children: [],
        elseChildren: [],
      }
      ensureActiveFlow()
      const dest = targetSteps ?? activeFlow()!.steps
      dest.push(step)
      overlay.remove()
      renderFlowPane()
    })

    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
  }

  function renderStepList(container: HTMLElement, steps: FlowStep[], depth: number): void {
    const DELAY_PRESETS = [
      { label: '无等待',      val: '' },
      { label: '短 0.5–1.5s', val: '500,1500' },
      { label: '中 1–3s',     val: '1000,3000' },
      { label: '长 3–6s',     val: '3000,6000' },
      { label: '自定义…',     val: 'custom' },
    ]

    let dragSrcIdx = -1

    steps.forEach((step, idx) => {
      const item = container.appendChild(document.createElement('div'))
      item.className = 'cp-step-item' + (selectedStepIds.has(step.id) ? ' cp-step-selected' : '')
      item.draggable = true
      item.style.paddingLeft = `${depth * 16}px`

      item.addEventListener('dragstart', e => {
        dragSrcIdx = idx
        e.dataTransfer!.effectAllowed = 'move'
        setTimeout(() => item.classList.add('cp-step-dragging'), 0)
      })
      item.addEventListener('dragend', () => {
        item.classList.remove('cp-step-dragging')
        container.querySelectorAll('.cp-step-drag-over')
          .forEach(el => el.classList.remove('cp-step-drag-over'))
      })
      item.addEventListener('dragover', e => {
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer!.dropEffect = 'move'
        if (dragSrcIdx !== idx) item.classList.add('cp-step-drag-over')
      })
      item.addEventListener('dragleave', e => {
        if (!item.contains(e.relatedTarget as Node)) item.classList.remove('cp-step-drag-over')
      })
      item.addEventListener('drop', e => {
        e.preventDefault()
        e.stopPropagation()
        item.classList.remove('cp-step-drag-over')
        if (dragSrcIdx < 0 || dragSrcIdx === idx) return
        const [moved] = steps.splice(dragSrcIdx, 1)
        steps.splice(idx, 0, moved)
        renderFlowPane()
      })

      const row = item.appendChild(document.createElement('div'))
      row.className = 'cp-step-row'

      const dragHandle = row.appendChild(document.createElement('span'))
      dragHandle.className = 'cp-step-drag-handle'
      dragHandle.textContent = '⠿'
      dragHandle.title = '拖拽排序'

      // 多选复选框
      const cb = row.appendChild(document.createElement('input'))
      cb.type = 'checkbox'
      cb.className = 'cp-step-cb'
      cb.checked = selectedStepIds.has(step.id)
      cb.addEventListener('click', e => {
        e.stopPropagation()
        const shiftKey = (e as MouseEvent).shiftKey
        if (shiftKey && lastClickedStepId != null) {
          const lastIdx = steps.findIndex(s => s.id === lastClickedStepId)
          if (lastIdx >= 0) {
            const from = Math.min(lastIdx, idx)
            const to   = Math.max(lastIdx, idx)
            const shouldSel = !selectedStepIds.has(steps[idx].id)
            for (let i = from; i <= to; i++) {
              if (shouldSel) selectedStepIds.add(steps[i].id)
              else selectedStepIds.delete(steps[i].id)
            }
          }
        } else {
          if (selectedStepIds.has(step.id)) selectedStepIds.delete(step.id)
          else selectedStepIds.add(step.id)
        }
        lastClickedStepId = step.id
        renderFlowPane()
      })

      const num = row.appendChild(document.createElement('span'))
      num.className = 'cp-step-num'
      num.textContent = String(idx + 1)

      const typeIcon = row.appendChild(document.createElement('span'))
      typeIcon.className = 'cp-step-icon'
      typeIcon.textContent = stepIcon(step.type)

      const lbl = row.appendChild(document.createElement('span'))
      lbl.className = 'cp-step-lbl'
      lbl.textContent = step.label
      lbl.title = step.label

      if (step.selector) {
        const sel = row.appendChild(document.createElement('span'))
        sel.className = 'cp-step-sel'
        sel.textContent = step.selector.cssSelector
        sel.title = step.selector.cssSelector
      }

      const stepActs = row.appendChild(document.createElement('div'))
      stepActs.className = 'cp-step-acts'

      const delBtn = stepActs.appendChild(document.createElement('button'))
      delBtn.className = 'cp-icon-btn cp-icon-btn--danger'
      delBtn.title = '删除'
      delBtn.textContent = '✕'
      delBtn.addEventListener('click', () => {
        steps.splice(idx, 1)
        selectedStepIds.delete(step.id)
        renderFlowPane()
      })

      if (step.type === 'condition') {
        // ── 辅助：创建分支「新增步骤」下拉菜单 ───────────────────────────────
        const makeBranchAddMenu = (targetArr: FlowStep[], pendingBranch: 'then' | 'else') => {
          const wrap = document.createElement('div')
          wrap.className = 'cp-add-step-wrap'
          wrap.style.cssText = 'display:inline-flex;align-items:center'

          const btn = wrap.appendChild(document.createElement('button'))
          btn.className = 'cp-icon-btn cp-icon-btn--primary cp-branch-add-btn'
          btn.textContent = '＋'

          const menu = wrap.appendChild(document.createElement('div'))
          menu.className = 'cp-add-step-menu'
          menu.style.display = 'none'
          menu.style.top = 'calc(100% + 4px)'
          menu.style.right = '0'
          menu.style.left = 'auto'

          const menuItems: { icon: string; label: string; action: () => void }[] = [
            {
              icon: '🎯', label: '选择元素',
              action: () => {
                pendingConditionTarget = { stepId: step.id, branch: pendingBranch }
                switchTab('scan')
              },
            },
            {
              icon: '🔁', label: '新建循环',
              action: () => openLoopWizardPicker(activeFlow()!, targetArr),
            },
            {
              icon: '❓', label: '条件判断',
              action: () => openConditionBuilder(activeFlow()!, targetArr),
            },
            {
              icon: '🔀', label: '嵌入流程',
              action: () => openEmbedFlowPicker(activeFlow()!, targetArr),
            },
          ]
          menuItems.forEach(({ icon, label, action }) => {
            const mi = menu.appendChild(document.createElement('button'))
            mi.className = 'cp-add-step-item'
            const iconEl = mi.appendChild(document.createElement('span'))
            iconEl.className = 'cp-add-step-item-icon'
            iconEl.textContent = icon
            const lblEl = mi.appendChild(document.createElement('span'))
            lblEl.textContent = label
            mi.addEventListener('click', e => {
              e.stopPropagation()
              menu.style.display = 'none'
              action()
            })
          })

          btn.addEventListener('click', e => {
            e.stopPropagation()
            const isOpen = menu.style.display !== 'none'
            // 关闭所有同级已开菜单
            shadow.querySelectorAll<HTMLElement>('.cp-add-step-menu').forEach(m => { m.style.display = 'none' })
            menu.style.display = isOpen ? 'none' : 'block'
          })
          shadow.addEventListener('click', () => { menu.style.display = 'none' }, { capture: false })

          return wrap
        }

        // ── 成立时分支 ────────────────────────────────────────────────────────
        step.children = step.children ?? []
        const thenHeader = container.appendChild(document.createElement('div'))
        thenHeader.className = 'cp-branch-header cp-branch-header--then'
        thenHeader.style.paddingLeft = `${(depth + 1) * 16 + 10}px`
        const thenLbl = thenHeader.appendChild(document.createElement('span'))
        thenLbl.className = 'cp-branch-label'
        thenLbl.textContent = '✓ 成立时'
        thenHeader.appendChild(makeBranchAddMenu(step.children, 'then'))
        if (step.children?.length) renderStepList(container, step.children, depth + 1)
        // ── 否则分支 ──────────────────────────────────────────────────────────
        step.elseChildren = step.elseChildren ?? []
        const elseHeader = container.appendChild(document.createElement('div'))
        elseHeader.className = 'cp-branch-header cp-branch-header--else'
        elseHeader.style.paddingLeft = `${(depth + 1) * 16 + 10}px`
        const elseLbl = elseHeader.appendChild(document.createElement('span'))
        elseLbl.className = 'cp-branch-label'
        elseLbl.textContent = '✗ 否则'
        elseHeader.appendChild(makeBranchAddMenu(step.elseChildren, 'else'))
        if (step.elseChildren?.length) renderStepList(container, step.elseChildren, depth + 1)
      } else {
        if (step.children?.length) {
          renderStepList(container, step.children, depth + 1)
        }
        if (step.type === 'loop_items') {
          // ── 循环体内「新增步骤」行 ──────────────────────────────────────────
          step.children = step.children ?? []
          const addFooter = container.appendChild(document.createElement('div'))
          addFooter.className = 'cp-branch-header cp-branch-header--loop-add'
          addFooter.style.paddingLeft = `${(depth + 1) * 16 + 10}px`

          const addLbl = addFooter.appendChild(document.createElement('span'))
          addLbl.className = 'cp-branch-label'
          addLbl.textContent = '＋ 在循环内新增步骤'

          // 下拉菜单按钮
          const loopAddWrap = addFooter.appendChild(document.createElement('div'))
          loopAddWrap.className = 'cp-add-step-wrap'
          loopAddWrap.style.cssText = 'display:inline-flex;align-items:center'

          const loopAddBtn = loopAddWrap.appendChild(document.createElement('button'))
          loopAddBtn.className = 'cp-icon-btn cp-icon-btn--primary cp-branch-add-btn'
          loopAddBtn.textContent = '＋'

          const loopAddMenu = loopAddWrap.appendChild(document.createElement('div'))
          loopAddMenu.className = 'cp-add-step-menu'
          loopAddMenu.style.display = 'none'
          loopAddMenu.style.top = 'calc(100% + 4px)'
          loopAddMenu.style.right = '0'
          loopAddMenu.style.left = 'auto'

          const loopMenuItems: { icon: string; label: string; action: () => void }[] = [
            {
              icon: '🎯', label: '选择元素',
              action: () => { pendingLoopChildTarget = step.id; switchTab('scan') },
            },
            {
              icon: '🔁', label: '新建循环',
              action: () => openLoopWizardPicker(activeFlow()!, step.children!),
            },
            {
              icon: '❓', label: '条件判断',
              action: () => openConditionBuilder(activeFlow()!, step.children!),
            },
            {
              icon: '🔀', label: '嵌入流程',
              action: () => openLoopChildFlowPicker(activeFlow()!, step),
            },
          ]
          loopMenuItems.forEach(({ icon, label, action }) => {
            const mi = loopAddMenu.appendChild(document.createElement('button'))
            mi.className = 'cp-add-step-item'
            const iconEl = mi.appendChild(document.createElement('span'))
            iconEl.className = 'cp-add-step-item-icon'
            iconEl.textContent = icon
            const lblEl = mi.appendChild(document.createElement('span'))
            lblEl.textContent = label
            mi.addEventListener('click', e => {
              e.stopPropagation()
              loopAddMenu.style.display = 'none'
              action()
            })
          })

          loopAddBtn.addEventListener('click', e => {
            e.stopPropagation()
            const isOpen = loopAddMenu.style.display !== 'none'
            shadow.querySelectorAll<HTMLElement>('.cp-add-step-menu').forEach(m => { m.style.display = 'none' })
            loopAddMenu.style.display = isOpen ? 'none' : 'block'
          })
          shadow.addEventListener('click', () => { loopAddMenu.style.display = 'none' }, { capture: false })
        }
      }

      // ── 步骤间等待分隔符（最后一步后不显示）──────────────────────────────────
      if (idx < steps.length - 1) {
        const sep = container.appendChild(document.createElement('div'))
        sep.className = 'cp-step-delay-sep'
        sep.addEventListener('dragover', e => e.stopPropagation())
        sep.addEventListener('drop', e => e.stopPropagation())

        const sepLine = sep.appendChild(document.createElement('div'))
        sepLine.className = 'cp-step-delay-line'

        const sepIcon = sepLine.appendChild(document.createElement('span'))
        sepIcon.className = 'cp-step-delay-icon'
        sepIcon.textContent = '⏱'

        const curDelayVal = (() => {
          if (!step.delay) return ''
          const key = step.delay.join(',')
          return DELAY_PRESETS.some(p => p.val === key) ? key : 'custom'
        })()

        const delaySel = sepLine.appendChild(document.createElement('select'))
        delaySel.className = 'cp-step-delay-sel'
        DELAY_PRESETS.forEach(p => {
          const o = delaySel.appendChild(document.createElement('option'))
          o.value = p.val
          o.textContent = p.label
          if (p.val === curDelayVal) o.selected = true
        })

        // 自定义时间输入
        const customWrap = sepLine.appendChild(document.createElement('span'))
        customWrap.className = 'cp-delay-custom'
        customWrap.style.display = curDelayVal === 'custom' ? 'flex' : 'none'

        const minInp = customWrap.appendChild(document.createElement('input'))
        minInp.type = 'number'; minInp.className = 'cp-delay-custom-inp'
        minInp.min = '0.1'; minInp.step = '0.1'; minInp.placeholder = '最小'
        if (step.delay) minInp.value = String(step.delay[0] / 1000)

        const tilde = customWrap.appendChild(document.createElement('span'))
        tilde.textContent = '~'; tilde.className = 'cp-delay-custom-tilde'

        const maxInp = customWrap.appendChild(document.createElement('input'))
        maxInp.type = 'number'; maxInp.className = 'cp-delay-custom-inp'
        maxInp.min = '0.1'; maxInp.step = '0.1'; maxInp.placeholder = '最大'
        if (step.delay) maxInp.value = String(step.delay[1] / 1000)

        const unitLbl = customWrap.appendChild(document.createElement('span'))
        unitLbl.textContent = 's'; unitLbl.className = 'cp-delay-custom-unit'

        const applyCustom = () => {
          const mn = parseFloat(minInp.value) || 0
          const mx = Math.max(parseFloat(maxInp.value) || 0, mn)
          step.delay = mn > 0 ? [Math.round(mn * 1000), Math.round(mx * 1000)] : undefined
        }
        minInp.addEventListener('change', e => { e.stopPropagation(); applyCustom() })
        maxInp.addEventListener('change', e => { e.stopPropagation(); applyCustom() })

        delaySel.addEventListener('change', e => {
          e.stopPropagation()
          const val = delaySel.value
          if (val === 'custom') {
            customWrap.style.display = 'flex'
            if (!minInp.value) { minInp.value = '1'; maxInp.value = '2' }
            applyCustom()
          } else {
            customWrap.style.display = 'none'
            step.delay = val ? val.split(',').map(Number) as [number, number] : undefined
          }
        })
      }
    })
  }

  // ── 转为循环：选取列表项 ───────────────────────────────────────────────────
  function openToLoopPicker(targetFlow: LocalFlow): void {
    shadow.getElementById('fp-loop-picker')?.remove()
    const ov = shadow.appendChild(document.createElement('div'))
    ov.id = 'fp-loop-picker'
    ov.className = 'cp-overlay'

    const card = ov.appendChild(document.createElement('div'))
    card.className = 'cp-builder-card'

    const titleEl = card.appendChild(document.createElement('div'))
    titleEl.className = 'cp-builder-title'
    titleEl.textContent = '🔁 转为循环'

    const descEl = card.appendChild(document.createElement('div'))
    descEl.className = 'cp-loop-desc'
    descEl.textContent = '请点击页面上的一个列表项（如卡片、行等），系统识别同类元素后，将当前流程步骤作为对每项的操作模板。'

    const btnRow = card.appendChild(document.createElement('div'))
    btnRow.className = 'cp-builder-btns'

    const cancelBtn = btnRow.appendChild(document.createElement('button'))
    cancelBtn.className = 'cp-builder-btn'
    cancelBtn.textContent = '取消'
    cancelBtn.addEventListener('click', () => ov.remove())

    const pickBtn = btnRow.appendChild(document.createElement('button'))
    pickBtn.className = 'cp-builder-btn cp-builder-btn--primary'
    pickBtn.textContent = '选取列表项 →'
    pickBtn.addEventListener('click', () => {
      ov.remove()
      host.style.pointerEvents = 'none'
      const pickerOv = document.createElement('div')
      pickerOv.style.cssText = 'position:fixed;inset:0;z-index:2147483645;cursor:crosshair'
      const hlDiv = document.createElement('div')
      hlDiv.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483645;border:2px solid #a6e3a1;background:rgba(166,227,161,.12);box-sizing:border-box;border-radius:3px;transition:all .05s'
      document.body.append(pickerOv, hlDiv)

      let cur: Element | null = null
      const onMove = (e: MouseEvent) => {
        pickerOv.style.pointerEvents = 'none'
        const t = document.elementFromPoint(e.clientX, e.clientY)
        pickerOv.style.pointerEvents = ''
        if (!t || t === hlDiv) return
        cur = t
        const r = t.getBoundingClientRect()
        Object.assign(hlDiv.style, { left:`${r.left}px`, top:`${r.top}px`, width:`${r.width}px`, height:`${r.height}px` })
      }
      const cleanupPicker = () => {
        pickerOv.remove(); hlDiv.remove()
        document.removeEventListener('mousemove', onMove, true)
        document.removeEventListener('click', onClick, true)
        document.removeEventListener('keydown', onKey, true)
        host.style.pointerEvents = 'all'
      }
      const onClick = (e: MouseEvent) => {
        e.preventDefault(); e.stopImmediatePropagation()
        if (!cur) { cleanupPicker(); return }
        const picked = cur
        cleanupPicker()
        openLoopConfirm(targetFlow, picked)
      }
      const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cleanupPicker() }

      document.addEventListener('mousemove', onMove, true)
      document.addEventListener('click', onClick, true)
      document.addEventListener('keydown', onKey, true)
    })

    ov.addEventListener('click', e => { if (e.target === ov) ov.remove() })
  }

  function openLoopConfirm(targetFlow: LocalFlow, pickedEl: Element): void {
    shadow.getElementById('fp-loop-confirm')?.remove()
    const { selector: detected, count: detectedCount } = detectListItems(pickedEl)

    const ov = shadow.appendChild(document.createElement('div'))
    ov.id = 'fp-loop-confirm'
    ov.className = 'cp-overlay'

    const card = ov.appendChild(document.createElement('div'))
    card.className = 'cp-builder-card'

    // ── 标题 ────────────────────────────────────────────────────────────────
    const titleEl = card.appendChild(document.createElement('div'))
    titleEl.className = 'cp-builder-title'
    titleEl.textContent = '🔍 识别列表项'

    // ── 说明 ────────────────────────────────────────────────────────────────
    const descEl = card.appendChild(document.createElement('div'))
    descEl.className = 'cp-loop-desc'
    descEl.textContent = '系统从你点击的位置向上查找，定位到以下列表项层级。可直接修改选择器。'

    // ── 选择器编辑框（带明显可编辑样式）────────────────────────────────────
    const selWrap = card.appendChild(document.createElement('div'))
    selWrap.className = 'cp-loop-sel-wrap'

    const selIcon = selWrap.appendChild(document.createElement('span'))
    selIcon.className = 'cp-loop-sel-icon'
    selIcon.textContent = '✏'
    selIcon.title = '可手动修改选择器'

    const selInp = selWrap.appendChild(document.createElement('input'))
    selInp.className = 'cp-loop-sel-inp'
    selInp.value = detected
    selInp.placeholder = '输入 CSS 选择器…'
    selInp.spellcheck = false

    // ── 匹配数量徽章（实时更新）──────────────────────────────────────────
    const countBadge = selWrap.appendChild(document.createElement('span'))
    countBadge.className = 'cp-loop-count-badge'
    countBadge.textContent = `×${detectedCount}`

    // ── 模板步骤预览 ────────────────────────────────────────────────────────
    const tmplRow = card.appendChild(document.createElement('div'))
    tmplRow.className = 'cp-loop-desc'
    tmplRow.textContent = `对每个列表项依次执行以下 ${targetFlow.steps.length} 个步骤作为模板：`

    const tmplList = card.appendChild(document.createElement('div'))
    tmplList.className = 'cp-loop-tmpl-list'
    targetFlow.steps.forEach(s => {
      const row = tmplList.appendChild(document.createElement('div'))
      row.className = 'cp-loop-tmpl-row'
      row.textContent = `${stepIcon(s.type)} ${s.label}`
    })

    // ── 实时更新匹配数量 ────────────────────────────────────────────────────
    selInp.addEventListener('input', () => {
      try {
        const n = document.querySelectorAll(selInp.value.trim()).length
        countBadge.textContent = `×${n}`
        countBadge.classList.toggle('cp-loop-count-badge--warn', n === 0)
      } catch {
        countBadge.textContent = '×?'
        countBadge.classList.add('cp-loop-count-badge--warn')
      }
    })

    // ── 操作按钮 ────────────────────────────────────────────────────────────
    const btnRow = card.appendChild(document.createElement('div'))
    btnRow.className = 'cp-builder-btns'

    const rePickBtn = btnRow.appendChild(document.createElement('button'))
    rePickBtn.className = 'cp-builder-btn'
    rePickBtn.textContent = '← 重新选择'
    rePickBtn.addEventListener('click', () => { ov.remove(); openToLoopPicker(targetFlow) })

    const confirmBtn = btnRow.appendChild(document.createElement('button'))
    confirmBtn.className = 'cp-builder-btn cp-builder-btn--primary'
    confirmBtn.textContent = '✓ 创建循环'
    confirmBtn.addEventListener('click', () => {
      const finalSel = selInp.value.trim() || detected
      let finalCount = detectedCount
      try { finalCount = document.querySelectorAll(finalSel).length } catch { /* ignore */ }

      // 过滤掉模板中「点击列表项本身」的冗余步骤（循环执行器会自动点击每项）
      const loopItemEls = new Set(Array.from(document.querySelectorAll(finalSel)))
      const templateSteps = targetFlow.steps.filter(step => {
        if (step.type !== 'click' || !step.selector) return true
        try {
          const target = document.querySelector(step.selector.cssSelector)
          return !target || !loopItemEls.has(target)
        } catch { return true }
      })

      const loopStep: FlowStep = {
        id: mkStepId(),
        type: 'loop_items',
        label: `循环 ${finalSel} ×${finalCount}`,
        selector: { cssSelector: finalSel },
        children: templateSteps,
        delay: [800, 2000],
      }
      targetFlow.steps = [loopStep]
      ov.remove()
      renderFlowPane()
    })

    ov.addEventListener('click', e => { if (e.target === ov) ov.remove() })
  }

  // ── 循环体内嵌入已保存流程 ──────────────────────────────────────────────────
  function openLoopChildFlowPicker(targetFlow: LocalFlow, loopStep: FlowStep): void {
    const PICKER_ID = 'fp-loop-child-flow-picker'
    shadow.getElementById(PICKER_ID)?.remove()

    const overlay = shadow.appendChild(document.createElement('div'))
    overlay.id = PICKER_ID
    overlay.className = 'cp-overlay'

    const card = overlay.appendChild(document.createElement('div'))
    card.className = 'cp-builder-card'

    const title = card.appendChild(document.createElement('div'))
    title.className = 'cp-builder-title'
    title.textContent = '🔀 选择嵌入到循环体的流程'

    const listEl = card.appendChild(document.createElement('div'))
    listEl.style.cssText = 'max-height:240px;overflow-y:auto;margin-bottom:8px'

    const embeddable = flows.filter(f => f.id !== targetFlow.id)
    if (!embeddable.length) {
      const empty = listEl.appendChild(document.createElement('div'))
      empty.className = 'cp-empty'
      empty.textContent = '暂无可嵌入的已保存流程'
    } else {
      embeddable.forEach(saved => {
        const row = listEl.appendChild(document.createElement('div'))
        row.className = 'cp-saved-row'
        row.style.cursor = 'pointer'

        const info = row.appendChild(document.createElement('div'))
        info.className = 'cp-saved-info'

        const name = info.appendChild(document.createElement('span'))
        name.className = 'cp-saved-name'
        name.textContent = saved.name

        const meta = info.appendChild(document.createElement('span'))
        meta.className = 'cp-saved-meta'
        meta.textContent = `${saved.steps.length} 步`

        row.addEventListener('click', () => {
          loopStep.children = loopStep.children ?? []
          loopStep.children.push({
            id: mkStepId(),
            type: 'call_flow',
            label: `嵌入：${saved.name}`,
            flowRef: saved.id,
            relativeSelector: false,
          })
          overlay.remove()
          renderFlowPane()
        })
      })
    }

    const cancelBtn = card.appendChild(document.createElement('button'))
    cancelBtn.className = 'cp-builder-btn'
    cancelBtn.textContent = '取消'
    cancelBtn.addEventListener('click', () => overlay.remove())

    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
  }

  // ── 新建循环向导：选两个同类操作目标，自动推算列表与相对选择器 ────────────────
  // 流程：pick1 → pick2 → computeLoopFromPicks([e1,e2])
  //         ok → openLoopWizardConfirm
  //         歧义 → pick3 → computeLoopFromPicks([e1,e2,e3]) → openLoopWizardConfirm

  function openLoopWizardPicker(targetFlow: LocalFlow, targetSteps?: FlowStep[]): void {
    shadow.getElementById('fp-loop-wizard')?.remove()
    if (!domTree.length) scanDomTree()
    switchTab('scan')
    renderScanPane()
    treePickMode = {
      label: '第 1 步：点击第一个操作目标（如第一条消息的回复按钮）',
      onPick: (el1) => onWizardPick1(targetFlow, el1, targetSteps),
      onCancel: () => { /* 用户取消 */ },
    }
    triggerTreeRenderAndScroll?.()
  }

  function onWizardPick1(targetFlow: LocalFlow, el1: Element, targetSteps?: FlowStep[]): void {
    showSelectedHl(el1)
    treePickMode = {
      label: '第 2 步：点击另一个同类操作目标（另一条消息的同位置按钮）',
      onPick: (el2) => onWizardPick2(targetFlow, el1, el2, targetSteps),
      onCancel: () => openLoopWizardPicker(targetFlow, targetSteps),
    }
    renderTree()
  }

  function onWizardPick2(targetFlow: LocalFlow, el1: Element, el2: Element, targetSteps?: FlowStep[]): void {
    const result = computeLoopFromPicks([el1, el2])
    if (result.ok) {
      openLoopWizardConfirm(targetFlow, result, targetSteps)
    } else {
      treePickMode = {
        label: `第 3 步：再点击一个同类目标（${result.message ?? '帮助消除歧义'}）`,
        onPick: (el3) => openLoopWizardConfirm(targetFlow, computeLoopFromPicks([el1, el2, el3]), targetSteps),
        onCancel: () => openLoopWizardPicker(targetFlow, targetSteps),
      }
      renderTree()
    }
  }

  interface LoopComputeResult {
    ok: boolean
    listSel: string
    relSel: string       // 空字符串 = 点击列表项本身
    listCount: number
    message?: string
  }

  function computeLoopFromPicks(picks: Element[]): LoopComputeResult {
    const err = (message: string): LoopComputeResult =>
      ({ ok: false, listSel: '', relSel: '', listCount: 0, message })

    // 求所有 pick 的最近公共祖先
    const lca = picks.reduce<Element>((acc, el) => wizardLcaTwo(acc, el), picks[0])

    // 找各 pick 在 lca 下的直接子级（即列表项）
    const listItems = picks.map(p => wizardChildOfLca(lca, p))
    if (listItems.some(it => !it)) return err('所选元素与公共祖先关系异常')
    const items = listItems as Element[]

    // 所有列表项必须互不相同
    if (new Set(items).size !== picks.length)
      return err('有元素位于同一列表项内，请在不同列表项中各选一个')

    // 生成列表项选择器
    const listSel = makeListItemSelector(items[0])
    const listCount = (() => { try { return document.querySelectorAll(listSel).length } catch { return 0 } })()

    // 计算每个 pick 相对其列表项的相对选择器
    const relSels = picks.map((p, i) => {
      if (p === items[i]) return ''
      return buildRelSel(buildPathToAncestor(items[i], p))
    })

    const allSame = relSels.every(r => r === relSels[0])
    if (!allSame && picks.length < 3)
      return { ok: false, listSel, relSel: relSels[0], listCount, message: '两次路径不一致，请再选第三个元素来确认' }

    // 3 次及以上：多数投票
    const relSel = allSame ? relSels[0] : (() => {
      const counts: Record<string, number> = {}
      for (const r of relSels) counts[r] = (counts[r] ?? 0) + 1
      return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
    })()

    return { ok: true, listSel, relSel, listCount }
  }

  // 求两个元素的最近公共祖先
  function wizardLcaTwo(a: Element, b: Element): Element {
    const pathA = new Set<Element>()
    let cur: Element | null = a
    while (cur) { pathA.add(cur); cur = cur.parentElement }
    cur = b
    while (cur) { if (pathA.has(cur)) return cur; cur = cur.parentElement }
    return document.documentElement
  }

  // 找 lca 的直接子级（该子级包含或等于 el）
  function wizardChildOfLca(lca: Element, el: Element): Element | null {
    if (el === lca) return null
    let cur: Element | null = el
    while (cur && cur.parentElement !== lca) cur = cur.parentElement
    return cur
  }

  // ── 新建循环向导：确认界面 ─────────────────────────────────────────────────────
  function openLoopWizardConfirm(targetFlow: LocalFlow, result: LoopComputeResult, targetSteps?: FlowStep[]): void {
    shadow.getElementById('fp-loop-wizard')?.remove()

    const ov = shadow.appendChild(document.createElement('div'))
    ov.id = 'fp-loop-wizard'
    ov.className = 'cp-overlay'
    const card = ov.appendChild(document.createElement('div'))
    card.className = 'cp-builder-card'

    const titleEl = card.appendChild(document.createElement('div'))
    titleEl.className = 'cp-builder-title'
    titleEl.textContent = result.ok ? '🔁 确认循环设置' : '🔁 循环设置（请检查）'

    if (!result.ok && result.message) {
      const warnEl = card.appendChild(document.createElement('div'))
      warnEl.className = 'cp-loop-desc'
      warnEl.style.color = '#f9e2af'
      warnEl.textContent = `⚠ ${result.message}`
    }

    // 列表项选择器
    const listLbl = card.appendChild(document.createElement('div'))
    listLbl.className = 'cp-builder-field-lbl'
    listLbl.textContent = '列表项选择器'
    const listWrap = card.appendChild(document.createElement('div'))
    listWrap.className = 'cp-loop-sel-wrap'
    const listIcon = listWrap.appendChild(document.createElement('span'))
    listIcon.className = 'cp-loop-sel-icon'; listIcon.textContent = '✏'
    const listInp = listWrap.appendChild(document.createElement('input'))
    listInp.className = 'cp-loop-sel-inp'
    listInp.value = result.listSel
    listInp.spellcheck = false
    const countBadge = listWrap.appendChild(document.createElement('span'))
    countBadge.className = 'cp-loop-count-badge'
    countBadge.textContent = `×${result.listCount}`
    listInp.addEventListener('input', () => {
      try {
        const n = document.querySelectorAll(listInp.value.trim()).length
        countBadge.textContent = `×${n}`
        countBadge.classList.toggle('cp-loop-count-badge--warn', n === 0)
      } catch { countBadge.textContent = '×?' }
    })

    // 相对选择器（自点击时隐藏）
    const isSelfClick = result.relSel === ''
    const relWrap = card.appendChild(document.createElement('div'))
    relWrap.style.display = isSelfClick ? 'none' : ''
    const relLbl = relWrap.appendChild(document.createElement('div'))
    relLbl.className = 'cp-builder-field-lbl'
    relLbl.textContent = '目标元素（相对选择器）'
    const relSelWrap = relWrap.appendChild(document.createElement('div'))
    relSelWrap.className = 'cp-loop-sel-wrap'
    const relIcon = relSelWrap.appendChild(document.createElement('span'))
    relIcon.className = 'cp-loop-sel-icon'; relIcon.textContent = '✏'
    const relInp = relSelWrap.appendChild(document.createElement('input'))
    relInp.className = 'cp-loop-sel-inp'
    relInp.value = result.relSel
    relInp.spellcheck = false

    // 操作类型
    const actionRow = card.appendChild(document.createElement('div'))
    actionRow.className = 'cp-builder-row'
    const actionLbl = actionRow.appendChild(document.createElement('label'))
    actionLbl.className = 'cp-builder-field-lbl'; actionLbl.textContent = '动作'
    const actionSel = actionRow.appendChild(document.createElement('select'))
    actionSel.className = 'cp-builder-select'
    ;[
      { v: 'click',     t: '🖱 点击' },
      { v: 'input',     t: '⌨ 输入文字' },
      { v: 'get_text',  t: '📝 获取文本' },
      { v: 'scroll_to', t: '📜 滚动到此' },
    ].forEach(({ v, t }) => {
      const o = actionSel.appendChild(document.createElement('option'))
      o.value = v; o.textContent = t
    })

    const valueRow = card.appendChild(document.createElement('div'))
    valueRow.className = 'cp-builder-row'
    valueRow.style.display = 'none'
    const valueLbl = valueRow.appendChild(document.createElement('label'))
    valueLbl.className = 'cp-builder-field-lbl'; valueLbl.textContent = '值'
    const valueInp = valueRow.appendChild(document.createElement('input'))
    valueInp.className = 'cp-builder-input'
    valueInp.placeholder = '留空则从变量读取'
    actionSel.addEventListener('change', () => {
      const t = actionSel.value
      valueRow.style.display = (t === 'input' || t === 'get_text') ? 'flex' : 'none'
      valueLbl.textContent = t === 'get_text' ? '存为变量' : '值'
      valueInp.placeholder = t === 'get_text' ? '变量名，如 name' : '留空则从变量读取'
    })

    const btnRow = card.appendChild(document.createElement('div'))
    btnRow.className = 'cp-builder-btns'

    const backBtn = btnRow.appendChild(document.createElement('button'))
    backBtn.className = 'cp-builder-btn'
    backBtn.textContent = '← 重新选择'
    backBtn.addEventListener('click', () => { ov.remove(); openLoopWizardPicker(targetFlow, targetSteps) })

    const confirmBtn = btnRow.appendChild(document.createElement('button'))
    confirmBtn.className = 'cp-builder-btn cp-builder-btn--primary'
    confirmBtn.textContent = '✓ 创建循环'
    confirmBtn.addEventListener('click', () => {
      const finalListSel = listInp.value.trim() || result.listSel
      const finalRelSel  = relInp.value.trim()
      const isSelf = !finalRelSel
      let count = 0
      try { count = document.querySelectorAll(finalListSel).length } catch { /* ignore */ }

      let childStep: FlowStep | null = null
      if (isSelf) {
        childStep = {
          id: mkStepId(),
          type: 'click',
          label: `点击 ${finalListSel}`,
          selector: { cssSelector: finalListSel },
          relativeSelector: true,
          delay: [600, 1200],
        }
      } else {
        childStep = {
          id: mkStepId(),
          type: actionSel.value as FlowStep['type'],
          label: `${actionSel.options[actionSel.selectedIndex].text.replace(/^.+? /, '')} ${finalRelSel}`,
          selector: { cssSelector: finalRelSel },
          relativeSelector: true,
          value: valueInp.value.trim() || undefined,
          delay: [500, 1500],
        }
      }

      ensureActiveFlow()
      const loopStep: FlowStep = {
        id: mkStepId(),
        type: 'loop_items',
        label: `循环 ${finalListSel} ×${count}`,
        selector: { cssSelector: finalListSel },
        children: [childStep],
        delay: [800, 2000],
      }
      const dest = targetSteps ?? activeFlow()!.steps
      dest.push(loopStep)
      ov.remove()
      renderFlowPane()
    })

    ov.addEventListener('click', e => { if (e.target === ov) ov.remove() })
  }

  // ── Settings ─────────────────────────────────────────────────────
  function openSettings(): void {
    shadow.getElementById('fp-settings')?.remove()
    const overlay = shadow.appendChild(document.createElement('div'))
    overlay.id = 'fp-settings'
    overlay.className = 'cp-overlay'
    const card = overlay.appendChild(document.createElement('div'))
    card.className = 'cp-builder-card'

    const title = card.appendChild(document.createElement('div'))
    title.className = 'cp-builder-title'
    title.textContent = '⚙ 设置'

    const mkSec = (text: string) => {
      const s = card.appendChild(document.createElement('div'))
      s.className = 'cp-settings-sec'
      s.textContent = text
    }

    const mkColorRow = (label: string, val: string, onChange: (v: string) => void) => {
      const row = card.appendChild(document.createElement('div'))
      row.className = 'cp-settings-row'
      const lbl = row.appendChild(document.createElement('span'))
      lbl.className = 'cp-settings-label'
      lbl.textContent = label
      const inp = row.appendChild(document.createElement('input'))
      inp.type = 'color'
      inp.value = val
      inp.className = 'cp-settings-color'
      inp.addEventListener('input', () => onChange(inp.value))
    }

    const mkOpacityRow = (label: string, val: number, onChange: (v: number) => void) => {
      const row = card.appendChild(document.createElement('div'))
      row.className = 'cp-settings-row'
      const lbl = row.appendChild(document.createElement('span'))
      lbl.className = 'cp-settings-label'
      lbl.textContent = label
      const inp = row.appendChild(document.createElement('input'))
      inp.type = 'range'
      inp.min = '0'
      inp.max = '1'
      inp.step = '0.05'
      inp.value = String(val)
      inp.className = 'cp-settings-range'
      const valLbl = row.appendChild(document.createElement('span'))
      valLbl.className = 'cp-settings-value'
      valLbl.textContent = Math.round(val * 100) + '%'
      inp.addEventListener('input', () => {
        const v = parseFloat(inp.value)
        onChange(v)
        valLbl.textContent = Math.round(v * 100) + '%'
      })
    }

    mkSec('🔵 悬浮高亮')
    mkColorRow('颜色', settings.hlColor, v => { settings.hlColor = v })
    mkOpacityRow('不透明度', settings.hlBgOpacity, v => { settings.hlBgOpacity = v })

    mkSec('🟢 选中高亮')
    mkColorRow('颜色', settings.selColor, v => { settings.selColor = v })
    mkOpacityRow('不透明度', settings.selBgOpacity, v => { settings.selBgOpacity = v })

    mkSec('🛠 步骤配置面板')
    const modeRow = card.appendChild(document.createElement('div'))
    modeRow.className = 'cp-settings-row'
    const modeLbl = modeRow.appendChild(document.createElement('span'))
    modeLbl.className = 'cp-settings-label'
    modeLbl.textContent = '打开方式'
    const modeSel = modeRow.appendChild(document.createElement('select'))
    modeSel.className = 'cp-builder-select cp-settings-mode-sel'
    ;[
      { value: 'squeeze', label: '⟺ 挤压页面（侧边展开）' },
      { value: 'overlay', label: '□ 遮罩浮层' },
    ].forEach(opt => {
      const o = modeSel.appendChild(document.createElement('option'))
      o.value = opt.value
      o.textContent = opt.label
      if (opt.value === settings.builderMode) o.selected = true
    })
    modeSel.addEventListener('change', () => {
      settings.builderMode = modeSel.value as 'squeeze' | 'overlay'
    })

    const btnRow = card.appendChild(document.createElement('div'))
    btnRow.className = 'cp-builder-btns'
    const doneBtn = btnRow.appendChild(document.createElement('button'))
    doneBtn.className = 'cp-builder-btn cp-builder-btn--primary'
    doneBtn.textContent = '完成'
    doneBtn.addEventListener('click', () => overlay.remove())
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
  }

  // ── Tab switch ────────────────────────────────────────────────────────────
  function switchTab(t: 'scan' | 'flow'): void {
    activeTab = t
    if (t === 'flow') { clearHoverHl(); clearSelectedHl() }
    scanPane.style.display = t === 'scan' ? 'flex' : 'none'
    flowPane.style.display = t === 'flow' ? 'flex' : 'none'

    if (t === 'scan') { setHdrBack(() => switchTab('flow')); if (!domTree.length) scanDomTree(); renderScanPane() }
    if (t === 'flow') loadFlowsAndRender()
  }

  // ── Page push helpers ──────────────────────────────────────────────────────
  // 原理：body 有 transform 时，CSS 规范将其后代的 position:fixed 元素
  // 的定位容器从“视口”变为“最近的 transformed 祖先”。
  // 因此 body{transform:translateX(-Xpx)} 会把 body 内所有内容
  // （包括 fixed header）一起向左移，实现全页推开。
  // 面板 host 挂在 <html> 下而非 <body> 下，因此不受 body transform 影响。
  let pushStyleEl: HTMLStyleElement | null = null

  function applyPush(w: number): void {
    if (!pushStyleEl || !pushStyleEl.isConnected) {
      pushStyleEl = document.createElement('style')
      pushStyleEl.id = 'fp-push-style'
      pushStyleEl.textContent =
        'body{transition:transform .25s cubic-bezier(.4,0,.2,1)!important}'
      ;(document.head ?? document.documentElement).appendChild(pushStyleEl)
    }
    document.body.style.transform = `translateX(-${w}px)`
  }

  function clearPush(): void {
    document.body.style.transform = ''
    document.documentElement.style.marginRight = ''  // 清除旧版可能残留的值
    document.body.style.marginRight = ''
    const el = pushStyleEl
    if (el) setTimeout(() => { el.remove(); if (pushStyleEl === el) pushStyleEl = null }, 280)
  }

  // ── Open / Close ──────────────────────────────────────────────────────────
  function open(): void {
    visible = true
    host.style.pointerEvents = 'all'
    if (panelMode === 'bottom') {
      panel.style.transform = 'translateY(0)'
    } else if (panelMode === 'float') {
      panel.style.transform = 'none'
      panel.style.opacity = '1'
    } else {
      panel.style.transform = 'translateX(0)'
      applyPush(currentW)
    }
    ticker = setInterval(() => {
      if (logSectionOpen) fetchLogs()
    }, 1500)
    switchTab('flow')
  }

  function close(): void {
    shadow.getElementById('fp-step-builder')?.remove()
    clearPush()
    visible = false
    host.style.pointerEvents = 'none'
    modeMenu.style.display = 'none'
    if (panelMode === 'bottom') {
      panel.style.transform = `translateY(${currentBottomH}px)`
    } else if (panelMode === 'float') {
      panel.style.transform = 'scale(.95)'
      panel.style.opacity = '0'
    } else {
      panel.style.transform = `translateX(${currentW}px)`
    }
    if (ticker) { clearInterval(ticker); ticker = null }
  }

  function toggle(): void { visible ? close() : open() }

  // ── Events ────────────────────────────────────────────────────────────────
  closeBtn.addEventListener('click', close)
  menuBtn.addEventListener('click', (e: MouseEvent) => {
    e.stopPropagation()
    modeMenu.style.display = modeMenu.style.display === 'none' ? 'flex' : 'none'
  })
  document.addEventListener('click', () => { modeMenu.style.display = 'none' })
  modeMenu.addEventListener('click', e => e.stopPropagation())

  // 初始 resize handle 样式（默认右侧模式）
  resizeHandle.style.cssText = 'position:absolute;left:0;top:0;bottom:0;width:4px;cursor:ew-resize;z-index:10'

  host.__fp_toggle = toggle
  return { toggle }
}

// ── Element classification ─────────────────────────────────────────────────────
function classifyElement(el: Element): ScannedElement | null {
  if (EXCLUDE_TAGS.has(el.tagName)) return null

  const tag = el.tagName.toLowerCase()
  const role = el.getAttribute('role') ?? ''
  const inputType = (el as HTMLInputElement).type?.toLowerCase() ?? ''
  const cs = window.getComputedStyle(el as HTMLElement)

  const hidden = cs.display === 'none' || cs.visibility === 'hidden' || (el as HTMLElement).hidden

  let kind: ScannedElement['kind'] = 'unknown'
  let confidence: Confidence = 'low'

  if (tag === 'input' && !['hidden', 'submit', 'button', 'image', 'reset'].includes(inputType)) {
    kind = 'input'; confidence = 'high'
  } else if (tag === 'textarea' || el.getAttribute('contenteditable') === 'true') {
    kind = 'input'; confidence = 'high'
  } else if (tag === 'select') {
    kind = 'select'; confidence = 'high'
  } else if (tag === 'button' || tag === 'a' || tag === 'summary') {
    kind = 'click'; confidence = 'high'
  } else if (['button', 'link', 'checkbox', 'radio', 'menuitem', 'tab', 'option'].includes(role)) {
    kind = 'click'; confidence = 'high'
  } else if (tag === 'input' && ['submit', 'button', 'image', 'reset'].includes(inputType)) {
    kind = 'click'; confidence = 'high'
  } else if (tag === 'canvas') {
    // canvas 元素：可保存图片，单独分类以便步骤构建器识别
    kind = 'unknown'; confidence = 'high'
  } else if (el.hasAttribute('onclick') || el.hasAttribute('data-testid')) {
    kind = 'click'; confidence = 'medium'
  } else if (cs.cursor === 'pointer') {
    kind = 'click'; confidence = 'medium'
  } else if (el.hasAttribute('tabindex')) {
    kind = 'click'; confidence = 'medium'
  } else {
    // 大容器跳过（无文字且子元素多）
    const txt = el.textContent?.trim() ?? ''
    if (!txt && el.children.length > 3) return null
    confidence = 'low'
    kind = 'unknown'
  }

  if (hidden) confidence = 'low'

  const selector = buildSelectorStrategy(el)
  if (!selector) return null

  const matchCount = (() => {
    // 用 ownerDocument 查询，确保 iframe 内元素选择器在正确的 document 里计数
    try { return el.ownerDocument.querySelectorAll(selector.cssSelector).length }
    catch { return 1 }
  })()

  return { el, kind, confidence, label: buildLabel(el), selector, matchCount }
}

function buildLabel(el: Element): string {
  const tag = el.tagName.toLowerCase()
  const ariaLabel = el.getAttribute('aria-label')
  const title = el.getAttribute('title')
  const placeholder = (el as HTMLInputElement).placeholder
  const text = el.textContent?.trim().slice(0, 40)
  const name = (el as HTMLInputElement).name

  const desc = ariaLabel || title || placeholder || text || name || ''
  const idPart = el.id ? `#${el.id}` : ''
  const clsPart = el.classList.length
    ? [...el.classList].slice(0, 2).map(c => `.${c}`).join('')
    : ''

  return `${tag}${idPart}${clsPart}${desc ? `  "${desc}"` : ''}`
}

function buildSelectorStrategy(el: Element): SelectorStrategy | null {
  const cssSelector = getCssSelector(el)
  if (!cssSelector) return null

  return {
    cssSelector,
    ariaLabel:  el.getAttribute('aria-label') ?? undefined,
    role:       el.getAttribute('role') ?? undefined,
    dataTestId: el.getAttribute('data-testid') ?? undefined,
    text:       el.textContent?.trim().slice(0, 80) || undefined,
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function highlightElement(el: Element): void {
  document.getElementById('fp-hl')?.remove()
  const r = el.getBoundingClientRect()
  const hl = Object.assign(document.createElement('div'), { id: 'fp-hl' })
  Object.assign(hl.style, {
    position: 'fixed',
    left: `${r.left}px`,
    top: `${r.top}px`,
    width: `${r.width}px`,
    height: `${r.height}px`,
    background: 'rgba(26,86,219,.18)',
    border: '2px solid #1a56db',
    borderRadius: '2px',
    pointerEvents: 'none',
    zIndex: '2147483645',
  })
  document.body.appendChild(hl)
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  setTimeout(() => hl.remove(), 2000)
}

function findStep(steps: FlowStep[], id: string): FlowStep | null {
  for (const s of steps) {
    if (s.id === id) return s
    if (s.children) {
      const found = findStep(s.children, id)
      if (found) return found
    }
    if (s.elseChildren) {
      const found = findStep(s.elseChildren, id)
      if (found) return found
    }
  }
  return null
}

function collectVars(steps: FlowStep[]): string[] {
  const vars: string[] = []
  const walk = (ss: FlowStep[]) => {
    for (const s of ss) {
      if (s.type === 'get_text' && s.value?.trim()) vars.push(s.value.trim())
      if (s.children) walk(s.children)
      if (s.elseChildren) walk(s.elseChildren)
    }
  }
  walk(steps)
  return [...new Set(vars)]
}

function kindIcon(kind: ScannedElement['kind']): string {
  return kind === 'click' ? '🖱' : kind === 'input' ? '⌨' : kind === 'select' ? '📋' : '？'
}

function stepIcon(type: FlowStep['type']): string {
  const map: Record<string, string> = {
    click: '🖱', input: '⌨', select: '📋', loop_items: '🔄',
    get_text: '📝',
    focus: '🎯',
    wait_appear: '⏳', wait_disappear: '⌛', scroll_to: '📜',
    navigate: '🔗', delay: '⏱', press_key: '⌨', condition: '❓',
    call_flow: '🔀',
  }
  return map[type] ?? '•'
}

function defaultStepName(action: string, item: ScannedElement): string {
  const text = item.el.textContent?.trim().slice(0, 20)
    || item.selector.cssSelector.slice(0, 20)
  const map: Record<string, string> = {
    click:          `点击 ${text}`,
    input:          `输入到 ${item.el.tagName.toLowerCase()}`,
    select:         `选择 ${item.el.tagName.toLowerCase()}`,
    get_text:       `获取文本 ${text}`,
    loop_items:     `循环 ${text}`,
    wait_appear:    `等待出现 ${text}`,
    wait_disappear: `等待消失 ${text}`,
    scroll_to:      `滚动到 ${text}`,
    focus:          `聚焦 ${text}`,
    save_canvas:    `保存图片 ${text}`,
  }
  return map[action] ?? text
}

function mkTab(parent: HTMLElement, text: string, active: boolean): HTMLElement {
  const el = parent.appendChild(document.createElement('button'))
  el.className = 'cp-tab' + (active ? ' cp-tab--on' : '')
  el.textContent = text
  return el
}

function mkAct(parent: HTMLElement, text: string, title: string): HTMLElement {
  const el = parent.appendChild(document.createElement('button'))
  el.className = 'cp-act'
  el.textContent = text
  el.title = title
  return el
}

/** 判断 id 是否为动态生成的随机 hash（含字母+数字混合段且长度≥5） */
function isDynamicId(id: string): boolean {
  return id.split(/[-_]/).some(seg => seg.length >= 5 && /[a-z]/i.test(seg) && /[0-9]/.test(seg))
}

function getCssSelector(el: Element): string {
  const parts: string[] = []
  let cur: Element | null = el
  // 用 ownerDocument 而非全局 document，确保 iframe 内元素也能正确生成选择器
  const root = el.ownerDocument.documentElement
  while (cur && cur !== root) {
    let seg = cur.tagName.toLowerCase()
    if (cur.id && !isDynamicId(cur.id)) {
      seg += `#${CSS.escape(cur.id)}`
      parts.unshift(seg)
      break
    }
    const siblings = cur.parentElement ? [...cur.parentElement.children] : []
    const idx = siblings.indexOf(cur) + 1
    if (siblings.filter(s => s.tagName === cur!.tagName).length > 1) seg += `:nth-child(${idx})`
    parts.unshift(seg)
    cur = cur.parentElement
  }
  return parts.join(' > ')
}

// ── 循环向导专用：为用户选中的列表项生成能匹配所有同类兄弟的选择器 ──────────────
// 始终以父级作为锚点 + 直接子代组合子，避免跨页面区域误匹配。
// 父级路径允许使用 id（增强定位稳定性），但列表项自身不使用 id / nth-child。
function makeListItemSelector(el: Element): string {
  const tag = el.tagName.toLowerCase()
  const classes = [...el.classList]
  const parent = el.parentElement

  if (parent) {
    const siblings = [...parent.children]
    // 父级用无 id 的路径，避免 id 截断导致选择器在其他父级下也能匹配
    const parentSel = getCssSelectorNoId(parent)

    // 策略A：全部 class（最精确）——兄弟中 ≥2 个匹配
    if (classes.length) {
      const fullSeg = tag + classes.map(c => `.${CSS.escape(c)}`).join('')
      const matched = siblings.filter(s => classes.every(c => s.classList.contains(c)))
      if (matched.length >= 2) return `${parentSel} > ${fullSeg}`
    }

    // 策略B：只用第一个 class——兄弟中 ≥2 个匹配
    if (classes.length) {
      const firstSeg = `${tag}.${CSS.escape(classes[0])}`
      const matched = siblings.filter(s => s.classList.contains(classes[0]))
      if (matched.length >= 2) return `${parentSel} > ${firstSeg}`
    }

    // 策略C：同标签兄弟 ≥2
    const sameTag = siblings.filter(s => s.tagName === el.tagName)
    if (sameTag.length >= 2) return `${parentSel} > ${tag}`
  }

  // 兜底：用无 id 的完整路径
  return getCssSelectorNoId(el)
}

// getCssSelector 的无 id 版本，用于生成父级路径（避免 id 导致唯一匹配）
function getCssSelectorNoId(el: Element): string {
  const parts: string[] = []
  let cur: Element | null = el
  const root = el.ownerDocument.documentElement
  while (cur && cur !== root) {
    const tag = cur.tagName.toLowerCase()
    const classes = [...cur.classList].slice(0, 2)
    let seg = classes.length ? tag + classes.map(c => `.${CSS.escape(c)}`).join('') : tag
    const siblings = cur.parentElement ? [...cur.parentElement.children] : []
    const sameSegCount = siblings.filter(s => {
      const t = s.tagName.toLowerCase()
      const sc = [...s.classList].slice(0, 2)
      return t + sc.map(c => `.${CSS.escape(c)}`).join('') === seg
    }).length
    if (sameSegCount > 1) seg += `:nth-child(${siblings.indexOf(cur) + 1})`
    parts.unshift(seg)
    cur = cur.parentElement
  }
  return parts.join(' > ')
}

// ── 向上爬树：找到「这一层有多个相似兄弟」才是真正的列表项层级 ──────────────────
// 用户点击的可能是列表项内部任意深度的子元素，需要逐层向上查找
function detectListItems(pickedEl: Element): { selector: string; count: number } {
  const tryCount = (sel: string): number => {
    try { return document.querySelectorAll(sel).length } catch { return 0 }
  }

  let cur: Element | null = pickedEl
  while (cur && cur.tagName !== 'BODY' && cur.tagName !== 'HTML') {
    const parent = cur.parentElement
    if (!parent) break
    const siblings = [...parent.children]
    if (siblings.length < 2) { cur = parent; continue }

    const classes = [...cur.classList]
    if (classes.length) {
      // 策略A：全部 class 联合（最精确，匹配同类卡片）
      const fullSel = classes.map(c => `.${CSS.escape(c)}`).join('')
      const sameAll = siblings.filter(s => classes.every(c => s.classList.contains(c)))
      if (sameAll.length > 1) {
        const n = tryCount(fullSel)
        return { selector: fullSel, count: n > 1 ? n : sameAll.length }
      }

      // 策略B：只用第一个 class（宽松匹配）
      const firstSel = `.${CSS.escape(classes[0])}`
      const sameFirst = siblings.filter(s => s.classList.contains(classes[0]))
      if (sameFirst.length > 1) {
        const n = tryCount(firstSel)
        return { selector: firstSel, count: n > 1 ? n : sameFirst.length }
      }
    }

    // 策略C：大多数兄弟同标签（无 class 的简单列表，如 li）
    const sameTag = siblings.filter(s => s.tagName === cur!.tagName)
    if (sameTag.length > 1 && sameTag.length / siblings.length >= 0.6) {
      const parentSel = getCssSelector(parent)
      const tagSel = `${parentSel} > ${cur.tagName.toLowerCase()}`
      const n = tryCount(tagSel)
      return { selector: tagSel, count: n > 1 ? n : sameTag.length }
    }

    cur = parent
  }

  // 兜底：返回被点击元素自身的选择器
  const ownSel = getCssSelector(pickedEl)
  return { selector: ownSel, count: tryCount(ownSel) || 1 }
}

// ── 循环向导辅助：生成元素的简短自身选择器（不含父级路径）─────────────────────
// 相对选择器片段：绝不使用 id（列表每项的 id 各不相同），改用 tag + class
function makeShortSel(el: Element): string {
  const tag = el.tagName.toLowerCase()
  const classes = [...el.classList].slice(0, 2)
  if (classes.length) return tag + classes.map(c => `.${CSS.escape(c)}`).join('')
  // 无 class：加 nth-child 保证在兄弟中唯一
  const siblings = el.parentElement ? [...el.parentElement.children] : []
  const sameTag = siblings.filter(s => s.tagName === el.tagName)
  if (sameTag.length > 1) {
    const idx = siblings.indexOf(el) + 1
    return `${tag}:nth-child(${idx})`
  }
  return tag
}

// ── 从 ancestor 直接子级到 descendant 的路径（包含 descendant，不含 ancestor）────
function buildPathToAncestor(ancestor: Element, descendant: Element): Element[] {
  const path: Element[] = []
  let cur: Element | null = descendant
  while (cur && cur !== ancestor) {
    path.unshift(cur)
    cur = cur.parentElement
  }
  return cur === ancestor ? path : []
}

// ── 将路径拼成相对选择器（路径已从 ancestor 的子级开始）──────────────────────
function buildRelSel(path: Element[]): string {
  return path.map(makeShortSel).join(' > ')
}

// ── Hex to RGB helper ─────────────────────────────────────────────────────
function hexToRgbStr(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  if (isNaN(r)) return '137,180,250'
  return `${r},${g},${b}`
}

// ── CSS ────────────────────────────────────────────────────────────────────────
function buildCSS(): string {
  return `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

.cp{
  position:absolute;inset:0;
  display:flex;flex-direction:column;
  background:#1e1e2e;border-left:1px solid #313244;
  font-family:'SF Mono','Fira Code',Consolas,monospace;font-size:12px;color:#cdd6f4;
  transition:transform .25s cubic-bezier(.4,0,.2,1),opacity .2s,border-radius .2s;
  overflow-x:hidden;
}

/* Header */
.cp-hdr{
  display:flex;align-items:center;justify-content:space-between;
  padding:0 6px;height:36px;border-bottom:1px solid #313244;flex-shrink:0;
}
.cp-tabs{display:flex}
.cp-tab{
  padding:0 10px;height:36px;background:transparent;border:none;
  border-bottom:2px solid transparent;color:#6c7086;cursor:pointer;
  font-size:11px;font-family:inherit;transition:color .12s,border-color .12s;
}
.cp-tab:hover{color:#cdd6f4}
.cp-tab--on{color:#89b4fa;border-bottom-color:#89b4fa}
.cp-acts{display:flex;gap:4px;flex:1;justify-content:flex-end}
.cp-hdr-title{color:#89b4fa;font-size:13px;font-weight:600;letter-spacing:.02em;padding-left:2px;flex:1}
.cp-hdr-back{background:transparent;border:none;border-radius:4px;color:#89b4fa;cursor:pointer;font-size:12px;font-family:inherit;font-weight:500;padding:3px 8px;flex:1;text-align:left;}
.cp-hdr-back:hover{background:#313244;color:#cdd6f4}
.cp-hdr-center{flex:0;color:#89b4fa;font-size:13px;font-weight:600;letter-spacing:.04em;pointer-events:none;white-space:nowrap}
.cp-act{
  width:26px;height:26px;background:transparent;border:1px solid transparent;
  border-radius:4px;color:#6c7086;cursor:pointer;font-size:14px;
  display:flex;align-items:center;justify-content:center;
  transition:background .12s,color .12s;
}
.cp-act:hover{background:#313244;color:#cdd6f4}

/* Resize handle */
.cp-resize-handle:hover{background:rgba(137,180,250,.25)}

/* Float mode SE-corner resize indicator */
.cp-resize-handle::after{
  content:'';position:absolute;right:3px;bottom:3px;
  width:7px;height:7px;
  border-right:2px solid #45475a;border-bottom:2px solid #45475a;
  border-radius:1px;
}

/* Mode menu */
.cp-mode-menu{
  position:absolute;top:36px;right:4px;
  z-index:20;
  flex-direction:column;
  background:#1e1e2e;border:1px solid #45475a;border-radius:8px;
  overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.5);
  min-width:110px;
}
.cp-mode-item{
  padding:8px 14px;background:transparent;border:none;
  color:#cdd6f4;cursor:pointer;font-size:12px;font-family:inherit;
  text-align:left;transition:background .1s;
}
.cp-mode-item:hover{background:#313244}
.cp-mode-item--on{color:#89b4fa;background:#1e3a5f}

/* Body */
.cp-body{flex:1;overflow:hidden;display:flex;flex-direction:column;position:relative}

/* Log pane */
.cp-log-pane{flex:1;overflow-y:auto;display:flex;flex-direction:column;padding:4px 0}
.cp-empty{
  padding:24px 16px;color:#6c7086;text-align:center;
  line-height:1.8;font-family:-apple-system,sans-serif;font-size:12px;
}
.cp-line{
  display:flex;gap:8px;align-items:baseline;
  padding:3px 10px;border-left:2px solid transparent;line-height:1.5;
}
.cp-line:hover{background:#181825}
.cp-line--new{border-left-color:#89b4fa}
.cp-ts{color:#6c7086;font-size:10px;flex-shrink:0}
.cp-msg{color:#cdd6f4;word-break:break-all;white-space:pre-wrap}

/* Scan pane */
.cp-scan-pane{flex:1;overflow:hidden;display:flex;flex-direction:column}
.cp-scan-bar{
  display:flex;flex-direction:column;gap:5px;padding:7px 10px;
  border-bottom:1px solid #313244;flex-shrink:0;
}
.cp-scan-bar-row{display:flex;align-items:center;gap:6px}
.cp-dom-rb--pick{
  flex:1;padding:5px 10px;background:#1a3a2a;color:#a6e3a1;
  font-size:12px;font-weight:600;border-radius:5px;
  border:1px solid rgba(166,227,161,.35);
}
.cp-dom-rb--pick:hover{background:#1e4a32;border-color:rgba(166,227,161,.7)}
.cp-dom-rb--pick.cp-dom-rb--active{background:#1e3a5f;color:#89dceb;box-shadow:0 0 0 1px #89dceb;border-color:#89dceb}
.cp-scan-filters{
  display:flex;gap:4px;padding:6px 10px;flex-shrink:0;
  border-bottom:1px solid #313244;flex-wrap:wrap;
}
.cp-filter-btn{
  padding:2px 8px;background:#313244;border:none;border-radius:10px;
  color:#6c7086;cursor:pointer;font-size:11px;font-family:inherit;
  transition:background .12s,color .12s;
}
.cp-filter-btn:hover{color:#cdd6f4}
.cp-filter-btn--on{background:#1e3a5f;color:#89b4fa}
.cp-scan-list{flex:1;overflow-y:auto;padding:4px 0}

/* Scan row */
.cp-scan-row{
  display:flex;align-items:center;gap:8px;
  padding:6px 10px;border-bottom:1px solid #181825;
}
.cp-scan-row:hover{background:#181825}
.cp-badge{
  width:22px;height:22px;border-radius:4px;
  display:flex;align-items:center;justify-content:center;
  font-size:13px;flex-shrink:0;
}
.cp-badge--high{background:#1a3a2a}
.cp-badge--medium{background:#2a2a1a}
.cp-badge--low{background:#2a1a2a}
.cp-scan-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.cp-scan-lbl{color:#cdd6f4;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cp-scan-sel{color:#6c7086;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cp-match-count{color:#f38ba8;font-weight:bold}
.cp-scan-acts{display:flex;gap:4px;flex-shrink:0}

/* Icon buttons */
.cp-icon-btn{
  width:24px;height:24px;background:transparent;border:1px solid #313244;
  border-radius:4px;color:#6c7086;cursor:pointer;font-size:13px;
  display:flex;align-items:center;justify-content:center;
  transition:background .12s,color .12s;
}
.cp-icon-btn:hover{background:#313244;color:#cdd6f4}
.cp-icon-btn--primary{color:#89b4fa;border-color:#1e3a5f}
.cp-icon-btn--primary:hover{background:#1e3a5f;color:#89b4fa}
.cp-icon-btn--danger:hover{background:#3a1a1a;color:#f38ba8}
.cp-pin-btn{color:#6b7280}
.cp-pin-btn--on{color:#f59e0b}

/* Step builder overlay */
.cp-overlay{
  position:absolute;inset:0;background:rgba(0,0,0,.65);
  display:flex;align-items:center;justify-content:center;z-index:10;
}
.cp-builder-card{
  background:#181825;border:1px solid #313244;border-radius:8px;
  padding:16px;width:320px;display:flex;flex-direction:column;gap:10px;
  box-shadow:0 8px 32px rgba(0,0,0,.5);
}
.cp-builder-title{font-size:13px;font-weight:600;color:#cdd6f4}
.cp-builder-info{display:flex;flex-direction:column;gap:4px}
.cp-builder-lbl{color:#fab387;font-size:12px;font-weight:500}
.cp-builder-warn{color:#f9e2af;font-size:11px}
.cp-builder-sel{color:#6c7086;font-size:10px;word-break:break-all}
.cp-builder-row{display:flex;align-items:center;gap:8px}
.cp-builder-field-lbl{color:#6c7086;font-size:11px;width:48px;flex-shrink:0}
.cp-builder-select,.cp-builder-input{
  flex:1;background:#313244;border:1px solid #45475a;border-radius:4px;
  color:#cdd6f4;font-size:12px;font-family:inherit;padding:4px 8px;
}
.cp-builder-select:focus,.cp-builder-input:focus{outline:none;border-color:#89b4fa}
.cp-loop-desc{color:#a6adc8;font-size:12px;line-height:1.6;padding:4px 0}
/* 列表项选择器编辑区 */
.cp-loop-sel-wrap{
  display:flex;align-items:center;gap:6px;
  background:#0d1117;border:1.5px solid #89b4fa;
  border-radius:6px;padding:6px 10px;
  cursor:text;
}
.cp-loop-sel-wrap:focus-within{border-color:#cba6f7;box-shadow:0 0 0 2px rgba(203,166,247,.2)}
.cp-loop-sel-icon{color:#89b4fa;font-size:12px;flex-shrink:0;user-select:none}
.cp-loop-sel-inp{
  flex:1;background:transparent;border:none;outline:none;
  color:#cdd6f4;font-size:12px;font-family:'SF Mono','Fira Code',Consolas,monospace;
  min-width:0;
}
.cp-loop-sel-inp::placeholder{color:#45475a}
.cp-loop-count-badge{
  flex-shrink:0;padding:2px 7px;
  background:#1a3a5f;color:#89b4fa;
  border-radius:10px;font-size:11px;font-weight:600;
  white-space:nowrap;
}
.cp-loop-count-badge--warn{background:#3a1a1a;color:#f38ba8}
/* 模板步骤预览 */
.cp-loop-tmpl-list{
  display:flex;flex-direction:column;gap:2px;
  max-height:120px;overflow-y:auto;
  background:#0d1117;border-radius:4px;padding:4px 8px;
}
.cp-loop-tmpl-row{
  color:#6c7086;font-size:11px;padding:2px 0;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
/* 向导面包屑 */
.cp-loop-crumb-wrap{
  display:flex;flex-direction:column;gap:4px;
  max-height:200px;overflow-y:auto;
}
.cp-loop-crumb-item{
  display:flex;align-items:center;gap:8px;
  padding:6px 10px;border-radius:5px;border:1px solid #313244;
  cursor:pointer;background:#181825;transition:background .1s,border-color .1s;
}
.cp-loop-crumb-item:hover{background:#1e1e3a;border-color:#45475a}
.cp-loop-crumb-item--selected{background:#1e3a5f;border-color:#89b4fa}
.cp-loop-crumb-depth{color:#45475a;font-size:10px;width:18px;text-align:center;flex-shrink:0}
.cp-loop-crumb-tag{color:#89b4fa;font-size:12px;font-family:'SF Mono','Fira Code',Consolas,monospace;flex-shrink:0}
.cp-loop-crumb-cls{color:#a6adc8;font-size:10px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cp-loop-crumb-badge{
  flex-shrink:0;padding:2px 6px;border-radius:8px;font-size:11px;font-weight:600;
  background:#313244;color:#a6adc8;
}
.cp-loop-crumb-badge--perfect{background:#1a3a2a;color:#a6e3a1}
.cp-loop-crumb-badge--warn{background:#3a1a1a;color:#f38ba8}
.cp-builder-btns{display:flex;justify-content:flex-end;gap:8px;margin-top:4px}
.cp-builder-btn{
  padding:5px 14px;background:#313244;border:none;border-radius:4px;
  color:#cdd6f4;cursor:pointer;font-size:12px;font-family:inherit;
  transition:background .12s;
}
.cp-builder-btn:hover{background:#45475a}
.cp-builder-btn--primary{background:#1e3a5f;color:#89b4fa}
.cp-builder-btn--primary:hover{background:#1a56db;color:#fff}

/* Flow pane */
.cp-flow-pane{flex:1;overflow:hidden;display:flex;flex-direction:column}
.cp-flow-bar{
  display:flex;align-items:center;justify-content:space-between;
  padding:6px 10px;border-bottom:1px solid #313244;flex-shrink:0;
}
.cp-flow-title{color:#6c7086;font-size:11px}
.cp-flow-bar-acts{display:flex;gap:4px}
.cp-flow-toolbar-row{
  display:flex;align-items:center;gap:6px;
  padding:5px 10px;border-bottom:1px solid #1e1e2e;flex-shrink:0;
  flex-wrap:wrap;
}
.cp-flow-act-btn{
  padding:3px 10px;background:#313244;border:none;border-radius:4px;
  color:#cdd6f4;cursor:pointer;font-size:11px;font-family:inherit;
  transition:background .12s;
}
.cp-flow-act-btn:hover:not(:disabled){background:#45475a}
.cp-flow-act-btn--run{background:#1a3a2a;color:#a6e3a1}
/* 新增步骤下拉 */
.cp-add-step-wrap{position:relative;display:inline-block}
.cp-add-step-btn{min-width:90px}
.cp-add-step-menu{
  position:absolute;top:calc(100% + 4px);left:0;z-index:100;
  background:#1e1e2e;border:1px solid #45475a;border-radius:6px;
  padding:4px 0;min-width:140px;box-shadow:0 4px 16px rgba(0,0,0,.5);
}
.cp-add-step-item{
  display:flex;align-items:center;gap:8px;width:100%;
  padding:7px 14px;background:none;border:none;
  color:#cdd6f4;font-size:12px;font-family:inherit;cursor:pointer;
  text-align:left;transition:background .1s;
}
.cp-add-step-item:hover{background:#313244}
.cp-add-step-item-icon{font-size:13px;flex-shrink:0;width:16px;text-align:center}
.cp-flow-act-btn--run:hover:not(:disabled){background:#1e5534}
.cp-flow-act-btn--save{background:#1e3a5f;color:#89b4fa}
.cp-flow-act-btn--save:hover:not(:disabled){background:#1a4a7a}
.cp-flow-act-btn:disabled{opacity:.4;cursor:not-allowed}
.cp-flow-list{flex:1;overflow-y:auto;padding:4px 0}
/* Flow project list */
.cp-flow-project-row{
  display:flex;align-items:center;justify-content:space-between;
  padding:8px 12px;border-bottom:1px solid #181825;
}
.cp-flow-project-row:hover{background:#1a1a2e}
.cp-flow-project-info{
  display:flex;flex-direction:column;gap:2px;
  flex:1;cursor:pointer;min-width:0;
}
.cp-flow-project-name{color:#cdd6f4;font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cp-flow-project-meta{color:#6c7086;font-size:10px}
.cp-flow-name-inp{
  flex:1;background:transparent;border:none;border-bottom:1px solid transparent;
  color:#cdd6f4;font-size:12px;font-family:inherit;padding:0 4px;
  outline:none;min-width:0;
}
.cp-flow-name-inp:focus{border-bottom-color:#89b4fa}
.cp-embed-flow-wrap{
  flex-shrink:0;padding:6px 10px;border-top:1px solid #313244;
}

/* Flow steps */
.cp-step-item{border-bottom:1px solid #181825}
.cp-step-item.cp-step-dragging{opacity:.35}
.cp-step-item.cp-step-drag-over{border-top:2px solid #89b4fa}
.cp-step-item.cp-step-selected{background:#1a2a40}
.cp-step-row{display:flex;align-items:center;gap:6px;padding:6px 10px}
.cp-step-row:hover{background:#181825}
.cp-step-drag-handle{
  color:#45475a;cursor:grab;font-size:14px;flex-shrink:0;
  padding:0 1px;user-select:none;line-height:1;
}
.cp-step-drag-handle:active{cursor:grabbing}
.cp-step-drag-handle:hover{color:#6c7086}
.cp-step-cb{
  width:13px;height:13px;flex-shrink:0;cursor:pointer;
  accent-color:#89b4fa;margin:0;
}
/* 步骤间等待分隔符 */
.cp-step-delay-sep{
  display:flex;align-items:center;padding:0 10px;
}
.cp-step-delay-line{
  display:flex;align-items:center;gap:4px;
  flex:1;border-left:2px dashed #313244;margin-left:14px;padding:3px 8px;
}
.cp-step-delay-icon{color:#585a70;font-size:11px;flex-shrink:0}
.cp-step-delay-sel,.cp-flow-global-delay-sel{
  background:#1e1e2e;border:1px solid #313244;border-radius:3px;
  color:#6c7086;font-size:10px;font-family:inherit;padding:1px 4px;
  cursor:pointer;outline:none;
}
.cp-step-delay-sel:hover,.cp-flow-global-delay-sel:hover{border-color:#45475a;color:#a6adc8}
.cp-step-delay-sel:focus,.cp-flow-global-delay-sel:focus{border-color:#89b4fa}
/* 自定义时间输入 */
.cp-delay-custom{display:flex;align-items:center;gap:3px;flex-shrink:0}
.cp-delay-custom-inp{
  width:38px;background:#181825;border:1px solid #313244;border-radius:3px;
  color:#cdd6f4;font-size:10px;font-family:inherit;padding:1px 3px;outline:none;
  -moz-appearance:textfield;
}
.cp-delay-custom-inp::-webkit-inner-spin-button,
.cp-delay-custom-inp::-webkit-outer-spin-button{-webkit-appearance:none}
.cp-delay-custom-inp:focus{border-color:#89b4fa}
.cp-delay-custom-tilde,.cp-delay-custom-unit{color:#585a70;font-size:10px;flex-shrink:0}
.cp-step-num{
  width:18px;height:18px;border-radius:3px;background:#313244;
  color:#6c7086;font-size:10px;display:flex;align-items:center;
  justify-content:center;flex-shrink:0;
}
.cp-step-icon{font-size:13px;flex-shrink:0}
.cp-step-lbl{flex:1;color:#cdd6f4;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cp-step-sel{color:#6c7086;font-size:10px;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cp-step-acts{display:flex;gap:2px;flex-shrink:0}

/* Saved flows */
.cp-saved-section{flex-shrink:0;border-top:2px solid #313244;padding-bottom:8px}
.cp-saved-title{
  padding:8px 12px 4px;color:#6c7086;font-size:10px;
  text-transform:uppercase;letter-spacing:.05em;
}
.cp-saved-row{
  display:flex;align-items:center;gap:8px;
  padding:6px 10px;border-bottom:1px solid #181825;
}
.cp-saved-row:hover{background:#181825}
.cp-saved-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.cp-saved-name{color:#cdd6f4;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cp-saved-meta{color:#6c7086;font-size:10px}

/* Shared bar elements */
.cp-dom-rb{
  padding:3px 10px;background:#313244;border:none;border-radius:4px;
  color:#89b4fa;cursor:pointer;font-size:11px;font-family:inherit;
}
.cp-dom-rb:hover{background:#45475a}
.cp-dom-rb--active{background:#1e3a5f;color:#89dceb;box-shadow:0 0 0 1px #89dceb}
.cp-dom-hint{color:#6c7086;font-size:11px}

/* DOM 树视图 */
.cp-filter-group-lbl{color:#585a70;font-size:10px;flex-shrink:0;align-self:center}
.cp-tree-search-wrap{padding:4px 8px;flex-shrink:0;position:relative;display:flex;align-items:center}
.cp-filter-bar{
  display:flex;align-items:center;gap:8px;padding:3px 10px 5px;
  border-bottom:1px solid #313244;flex-shrink:0;
}
.cp-filter-count-lbl{flex:1;color:#6c7086;font-size:10px}
.cp-tree-search{
  flex:1;box-sizing:border-box;background:#181825;border:1px solid #313244;
  border-radius:5px;color:#cdd6f4;font-size:12px;font-family:inherit;
  padding:5px 28px 5px 10px;outline:none;
}
.cp-tree-search:focus{border-color:#89b4fa}
.cp-tree-search::placeholder{color:#45475a}
.cp-search-clear{
  position:absolute;right:14px;background:none;border:none;
  color:#6c7086;font-size:11px;cursor:pointer;padding:2px 4px;
  line-height:1;border-radius:3px;
}
.cp-search-clear:hover{color:#cdd6f4;background:#313244}
.cp-sel-bar{
  display:flex;align-items:center;gap:8px;padding:6px 10px;
  border-top:1px solid #313244;background:#12121e;flex-shrink:0;
}
.cp-sel-bar-lbl{flex:1;color:#89b4fa;font-size:11px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cp-sel-bar-add{padding:3px 12px;background:#1e3a5f;color:#89b4fa;border:1px solid #2a5f9e;border-radius:4px}
.cp-sel-bar-add:hover{background:#1a56db;color:#fff}
.cp-tree{flex:1;overflow-y:auto;padding:2px 0}
.cp-tree-row{
  display:flex;align-items:center;min-height:22px;padding:1px 6px 1px 0;
  gap:3px;border-bottom:1px solid transparent;
}
.cp-tree-row--clickable{cursor:pointer}
.cp-tree-row:hover{background:#181825}
.cp-tree-row--selected{background:#1e3a5f!important;outline:1px solid #89b4fa;outline-offset:-1px}
.cp-tree-row--ancestor{opacity:.38}
/* DOM 树拾取模式样式 */
.cp-tree-row--pickable{cursor:crosshair;background:#0e2a1f}
.cp-tree-row--pickable:hover{background:#1a3d2b!important;outline:1px solid #a6e3a1;outline-offset:-1px}
.cp-tree-row--pick-disabled{opacity:.28;cursor:not-allowed}
.cp-tree-pick-banner{
  display:flex;align-items:center;gap:8px;padding:6px 10px;
  background:#1a2e1a;border-bottom:1px solid #2a4a2a;flex-shrink:0;
}
.cp-tree-pick-msg{flex:1;font-size:12px;color:#a6e3a1;font-weight:500}
.cp-tree-toggle{
  width:14px;flex-shrink:0;color:#6c7086;font-size:10px;
  cursor:pointer;text-align:center;user-select:none;line-height:22px;
  display:inline-block;transition:transform .15s;
}
.cp-tree-toggle--open{transform:rotate(90deg)}
.cp-tree-toggle:hover{color:#cdd6f4}
.cp-tree-leaf{color:#2a2a3a;cursor:default;transform:none!important}
.cp-tree-tag{color:#89b4fa;font-size:11px;flex-shrink:0}
.cp-tree-meta{
  color:#6c7086;font-size:10px;white-space:nowrap;overflow:hidden;
  text-overflow:ellipsis;max-width:110px;
}
.cp-kind-badge{
  display:inline-flex;align-items:center;padding:1px 5px;
  border-radius:3px;font-size:10px;flex-shrink:0;cursor:default;line-height:16px;
}
.cp-kind-badge--high{background:#1a3a2a;color:#a6e3a1}
.cp-kind-badge--medium{background:#2e2a14;color:#f9e2af}
.cp-kind-badge--low{background:#2a1a1e;color:#f38ba8}
.cp-tree-spacer{flex:1;min-width:4px}
.cp-tree-btn{opacity:0;transition:opacity .08s;width:22px;height:20px;font-size:12px}
.cp-tree-row:hover .cp-tree-btn{opacity:1}

/* Builder side panel (squeeze mode) */
.cp-builder-side{
  position:absolute;left:420px;top:0;bottom:0;width:340px;
  background:#12121e;border-left:2px solid #313244;
  display:flex;flex-direction:column;gap:10px;padding:16px;
  overflow-y:auto;z-index:5;
  box-shadow:-4px 0 16px rgba(0,0,0,.4);
}

/* Settings */
.cp-settings-sec{
  font-size:10px;font-weight:600;color:#6c7086;text-transform:uppercase;
  letter-spacing:.06em;padding-top:10px;border-top:1px solid #313244;margin-top:2px;
}
.cp-settings-row{display:flex;align-items:center;gap:8px;min-height:26px}
.cp-settings-label{color:#a6adc8;font-size:11px;width:72px;flex-shrink:0}
.cp-settings-color{
  width:36px;height:22px;border:1px solid #45475a;border-radius:3px;
  cursor:pointer;padding:1px;background:transparent;
}
.cp-settings-range{flex:1;accent-color:#89b4fa;cursor:pointer;height:4px}
.cp-settings-value{color:#585a70;font-size:10px;width:32px;text-align:right;flex-shrink:0}
.cp-settings-mode-sel{font-size:11px}

/* Inline log section */
.cp-log-section{flex-shrink:0;border-top:1px solid #313244}
.cp-log-section-hdr{
  width:100%;display:flex;align-items:center;gap:8px;
  padding:6px 12px;background:transparent;border:none;cursor:pointer;
  color:#cdd6f4;font-size:12px;font-family:inherit;text-align:left;
}
.cp-log-section-hdr:hover{background:#181825}
.cp-log-section-title{flex:1;font-size:12px;font-weight:500;color:#a6adc8}
.cp-log-toggle-icon{color:#6c7086;font-size:10px;flex-shrink:0}
.cp-log-clear-btn{
  padding:1px 8px;background:transparent;border:1px solid #313244;
  border-radius:3px;color:#6c7086;cursor:pointer;font-size:10px;font-family:inherit;
}
.cp-log-clear-btn:hover{background:#313244;color:#cdd6f4}
.cp-log-drag-bar{
  height:5px;cursor:ns-resize;background:transparent;
  border-top:1px solid #313244;
}
.cp-log-drag-bar:hover{background:rgba(137,180,250,.25)}
.cp-log-body{
  overflow-y:auto;flex-direction:column;
  border-top:1px solid #181825;
}

/* Condition branch headers */
.cp-branch-header{
  display:flex;align-items:center;gap:6px;
  padding:3px 10px;margin:1px 0;
  border-left:3px solid #313244;background:#12121e;
}
.cp-branch-header--then{border-left-color:#a6e3a1}
.cp-branch-header--else{border-left-color:#f38ba8}
.cp-branch-header--loop-add{border-left-color:#89b4fa;cursor:default}
.cp-branch-label{
  font-size:10px;font-weight:700;letter-spacing:.05em;flex:1;
}
.cp-branch-header--then .cp-branch-label{color:#a6e3a1}
.cp-branch-header--else .cp-branch-label{color:#f38ba8}
.cp-branch-header--loop-add .cp-branch-label{color:#89b4fa}
.cp-branch-add-btn{opacity:1!important;width:20px;height:20px;font-size:11px}
`
}
