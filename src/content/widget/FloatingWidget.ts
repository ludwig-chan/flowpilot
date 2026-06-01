import type { FlowStep, TaskStatus } from '@shared/types/flow'
import type { ExtensionMessage } from '@shared/types/message'
import { runFlow, stopFlow as stopFlowEngine } from '../engine/SemanticRunner'

const BTN_SIZE = 28
const PANEL_W  = 288

interface StoredFlow {
  id: string
  name: string
  steps: FlowStep[]
  pinnedInMenu?: boolean
}

export function initFloatingWidget(): void {
  if (window !== window.top) return              // 只在顶层 frame 注入
  if (document.getElementById('fp-widget-host')) return

  const host = document.createElement('div')
  host.id = 'fp-widget-host'
  Object.assign(host.style, {
    position: 'fixed',
    right:    '24px',
    bottom:   '24px',
    width:    `${BTN_SIZE}px`,
    height:   `${BTN_SIZE}px`,
    zIndex:   '2147483647',
    overflow: 'visible',
  })
  // 挂在 <html>：避免被 ConsolePanel 的 body transform 推走
  document.documentElement.appendChild(host)
  const shadow = host.attachShadow({ mode: 'open' })

  // ── 样式 ──────────────────────────────────────────────────────────────────
  const styleEl = document.createElement('style')
  styleEl.textContent = buildCSS()
  shadow.appendChild(styleEl)

  // ── DOM 骨架 ──────────────────────────────────────────────────────────────
  const wrap = shadow.appendChild(document.createElement('div'))
  wrap.className = 'fp-wrap'

  const btn = wrap.appendChild(document.createElement('button'))
  btn.className = 'fp-btn'
  btn.title = 'FlowPilot'
  btn.innerHTML = logoSVG()

  const panel = wrap.appendChild(document.createElement('div'))
  panel.className = 'fp-panel'
  panel.style.display = 'none'

  // ── 运行时状态 ────────────────────────────────────────────────────────────
  let taskStatus:   TaskStatus  = 'idle'
  let activeFlowId: string|null = null
  let expandedId:   string|null = null
  let panelVisible              = false
  let isDragging = false
  let wasDragged = false
  let dragStartX = 0, dragStartY = 0
  let hostLeft   = 0, hostTop    = 0
  const logLines: string[] = []
  let pinnedFlows: StoredFlow[] = []
  const flowVars: Record<string, Record<string, string>> = {}

  // ── 工具函数 ──────────────────────────────────────────────────────────────
  function addLog(text: string): void {
    logLines.unshift(`[${new Date().toLocaleTimeString()}] ${text}`)
    if (logLines.length > 8) logLines.pop()
    refreshLog()
    chrome.runtime.sendMessage({ type: 'FLOW_LOG', text } satisfies ExtensionMessage).catch(() => {})
  }

  function setBtnStatus(s: TaskStatus): void {
    taskStatus = s
    btn.dataset.status = s
    btn.innerHTML = s === 'running' ? stopBtnHTML() : logoSVG()
  }

  // ── DOM 抓取工具 ──────────────────────────────────────────────────────────
  // ── 渲染面板 ──────────────────────────────────────────────────────────────
  function renderPanel(): void {
    panel.innerHTML = ''

    const hdr = panel.appendChild(document.createElement('div'))
    hdr.className = 'fp-hdr'
    hdr.textContent = 'FlowPilot'

    const list = panel.appendChild(document.createElement('div'))
    list.className = 'fp-list'

    if (!pinnedFlows.length) {
      const empty = list.appendChild(document.createElement('div'))
      empty.className = 'fp-empty'
      empty.textContent = '暂无已钉选的流程'
    }

    for (const flow of pinnedFlows) {
      const item = list.appendChild(document.createElement('div'))
      item.className = 'fp-item' + (expandedId === flow.id ? ' fp-item--open' : '')

      const row = item.appendChild(document.createElement('div'))
      row.className = 'fp-row'

      const nameSp = row.appendChild(document.createElement('span'))
      nameSp.className = 'fp-name'
      nameSp.textContent = flow.name

      if (activeFlowId === flow.id) {
        const badge = row.appendChild(document.createElement('span'))
        badge.className = `fp-badge fp-badge--${taskStatus}`
        badge.textContent = STATUS_TEXT[taskStatus] ?? ''
      }

      const isRunning = taskStatus === 'running' && activeFlowId === flow.id
      const rb = row.appendChild(document.createElement('button'))
      rb.className   = 'fp-rbtn-inline' + (isRunning ? ' fp-rbtn--stop' : '')
      rb.textContent = isRunning ? '⏹' : '▶'
      rb.title       = isRunning ? '停止' : '运行'
      rb.addEventListener('click', e => {
        e.stopPropagation()
        isRunning ? doStop() : doRunStored(flow)
      })
    }

    const logDiv = panel.appendChild(document.createElement('div'))
    logDiv.className = 'fp-log'
    logDiv.style.display = logLines.length ? '' : 'none'
    logLines.slice(0, 4).forEach(l => {
      const p = logDiv.appendChild(document.createElement('p'))
      p.className   = 'fp-ll'
      p.textContent = l
    })

    // ── 工具区 ──────────────────────────────────────────────────────────────
    const domTools = panel.appendChild(document.createElement('div'))
    domTools.className = 'fp-dom-tools'

    const btnHome = domTools.appendChild(document.createElement('button'))
    btnHome.className   = 'fp-dom-btn'
    btnHome.textContent = '🏠 主页'
    btnHome.title       = '打开 FlowPilot 设置页面'
    btnHome.addEventListener('click', e => {
      e.stopPropagation()
      chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS_PAGE' }).catch(() => {})
    })

  }

  function refreshLog(): void {
    const logDiv = panel.querySelector<HTMLElement>('.fp-log')
    if (!logDiv) return
    logDiv.style.display = logLines.length ? '' : 'none'
    logDiv.innerHTML = ''
    logLines.slice(0, 4).forEach(l => {
      const p = logDiv.appendChild(document.createElement('p'))
      p.className   = 'fp-ll'
      p.textContent = l
    })
  }

  // ── 运行 / 停止 ──────────────────────────────────────────────────────────
  function doRunStored(flow: StoredFlow): void {
    if (!flow.steps?.length) { addLog(`「${flow.name}」没有配置步骤`); return }
    activeFlowId = flow.id
    setBtnStatus('running')
    // 自动关闭面板，避免面板出现在截图中
    panelVisible = false
    panel.style.display = 'none'
    addLog(`启动「${flow.name}」...`)

    runFlow(flow.steps, { ...flowVars[flow.id] }, addLog)
      .then(() => {
        activeFlowId = null
        setBtnStatus('done')
        addLog('✓ 完成')
        renderPanel()
        chrome.runtime.sendMessage({ type: 'FLOW_DONE' } satisfies ExtensionMessage).catch(() => {})
      })
      .catch((err: Error) => {
        activeFlowId = null
        setBtnStatus('error')
        addLog(`✗ ${err.message}`)
        renderPanel()
        chrome.runtime.sendMessage({ type: 'FLOW_ERROR', error: err.message } satisfies ExtensionMessage).catch(() => {})
      })
  }

  function doRun(flow: StoredFlow): void { doRunStored(flow) }

  function doStop(): void {
    stopFlowEngine()
    activeFlowId = null
    setBtnStatus('idle')
    addLog('已停止')
    renderPanel()
  }

  // ── 面板显示 / 隐藏 ──────────────────────────────────────────────────────
  function openPanel(): void {
    if (!panelVisible) {
      panelVisible = true
      panel.style.display = 'block'
      // 加载已钉选的流程
      chrome.runtime.sendMessage({ type: 'GET_BUILT_FLOWS' })
        .then((res: { ok: boolean; flows: unknown[] }) => {
          const raw = Array.isArray(res?.flows) ? res.flows : []
          // 递归收集所有 pinnedInMenu=true 的叶子流程
          function collectPinned(nodes: unknown[]): StoredFlow[] {
            const result: StoredFlow[] = []
            for (const n of nodes as Array<Record<string, unknown>>) {
              if (n.kind === 'folder' && Array.isArray(n.children)) {
                result.push(...collectPinned(n.children))
              } else if (n.kind === 'flow' && n.pinnedInMenu) {
                result.push(n as unknown as StoredFlow)
              }
            }
            return result
          }
          pinnedFlows = collectPinned(raw)
          for (const f of pinnedFlows) {
            if (!flowVars[f.id]) flowVars[f.id] = {}
          }
          renderPanel()
        })
        .catch(() => renderPanel())
    }
  }
  btn.addEventListener('click', () => {
    if (wasDragged) { wasDragged = false; return }
    if (taskStatus === 'running') { doStop(); return }   // 执行中点击即停止
    if (panelVisible) {
      panelVisible = false
      panel.style.display = 'none'
    } else {
      openPanel()
    }
  })

  // ── 拖拽（mousedown 时转换为 left/top 坐标）────────────────────────────────
  btn.addEventListener('mousedown', (e: MouseEvent) => {
    if (e.button !== 0) return
    isDragging = true
    wasDragged = false
    const rect = host.getBoundingClientRect()
    hostLeft   = rect.left
    hostTop    = rect.top
    dragStartX = e.clientX
    dragStartY = e.clientY
    // 从 right/bottom 切换到 left/top，方便拖拽计算
    host.style.right  = ''
    host.style.bottom = ''
    host.style.left   = `${hostLeft}px`
    host.style.top    = `${hostTop}px`
    e.preventDefault()
  })

  document.addEventListener('mousemove', (e: MouseEvent) => {
    if (!isDragging) return
    const dx = e.clientX - dragStartX
    const dy = e.clientY - dragStartY
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) wasDragged = true
    const newLeft = Math.max(0, Math.min(window.innerWidth  - BTN_SIZE, hostLeft + dx))
    const newTop  = Math.max(0, Math.min(window.innerHeight - BTN_SIZE, hostTop  + dy))
    host.style.left = `${newLeft}px`
    host.style.top  = `${newTop}px`
  })

  document.addEventListener('mouseup', () => { isDragging = false })
}

// ── Logo —— 使用扩展图标 ────────────────────────────────────────────────────────
function logoSVG(): string {
  const url = chrome.runtime.getURL('icons/icon48.png')
  return `<img src="${url}" width="28" height="28" style="border-radius:4px;pointer-events:none;" />`
}

function spinnerHTML(): string {
  return '<span class="fp-spinner"></span>'
}

function stopBtnHTML(): string {
  return `<span style="display:flex;align-items:center;justify-content:center;width:${BTN_SIZE}px;height:${BTN_SIZE}px;border-radius:50%;background:#ef4444;color:#fff;font-size:14px;pointer-events:none;">⏹</span>`
}

const STATUS_TEXT: Partial<Record<TaskStatus, string>> = {
  running: '运行中',
  done:    '已完成',
  error:   '出错',
  paused:  '已暂停',
}

// ── CSS ───────────────────────────────────────────────────────────────────────
function buildCSS(): string {
  return `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

.fp-wrap{
  position:relative;
  width:${BTN_SIZE}px;
  height:${BTN_SIZE}px;
}

/* ─── 触发按钮（与图标等大，无背景圆形） ───────────────────────────── */
.fp-btn{
  position:absolute;
  inset:0;
  border:none;
  background:transparent;
  display:flex;align-items:center;justify-content:center;
  cursor:pointer;
  padding:0;
  transition:opacity .15s;
  outline:none;
  -webkit-user-select:none;user-select:none;
}
.fp-btn:hover{opacity:.8}
.fp-btn:active{opacity:.6}
.fp-btn[data-status=running]{animation:fp-pulse 1.8s ease-in-out infinite;border-radius:50%;}

@keyframes fp-pulse{
  0%,100%{box-shadow:0 4px 16px rgba(239,68,68,.5)}
  50%{box-shadow:0 0 0 10px rgba(239,68,68,.1),0 4px 16px rgba(239,68,68,.3)}
}

.fp-spinner{
  display:block;width:20px;height:20px;
  border:2.5px solid rgba(26,86,219,.2);
  border-top-color:#1a56db;border-radius:50%;
  animation:fp-spin .72s linear infinite;
}
@keyframes fp-spin{to{transform:rotate(360deg)}}

/* ─── 面板（溢出宿主，绝对定位于按钮上方） ─────────────────────────── */
.fp-panel{
  position:absolute;
  bottom:${BTN_SIZE + 10}px;right:0;
  width:${PANEL_W}px;
  background:#fff;border-radius:12px;
  box-shadow:0 8px 32px rgba(0,0,0,.16),0 2px 8px rgba(0,0,0,.08);
  overflow:hidden;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  font-size:13px;color:#1a1a1a;
}

.fp-hdr{
  padding:10px 14px;
  font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;
  color:#9ca3af;border-bottom:1px solid #f3f4f6;
  user-select:none;
}

.fp-list{max-height:300px;overflow-y:auto;padding:6px;}

.fp-item{border-radius:8px;overflow:hidden;margin-bottom:2px;}

.fp-row{
  display:flex;align-items:center;gap:6px;
  padding:9px 10px;cursor:pointer;border-radius:8px;
  transition:background .12s;user-select:none;
}
.fp-row:hover,.fp-item--open .fp-row{background:#f3f4f6}

.fp-name{
  font-size:13px;font-weight:500;color:#111827;
  flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
}

.fp-badge{font-size:10px;padding:2px 6px;border-radius:8px;font-weight:600;white-space:nowrap;}
.fp-badge--running{background:#dcfce7;color:#16a34a}
.fp-badge--done   {background:#cffafe;color:#0891b2}
.fp-badge--error  {background:#fee2e2;color:#dc2626}
.fp-badge--paused {background:#fef9c3;color:#ca8a04}

.fp-arrow{font-size:9px;color:#9ca3af;flex-shrink:0;}

/* ─── 展开区 ─────────────────────────────────────────────────────────── */
.fp-body{padding:4px 10px 10px;display:flex;flex-direction:column;gap:7px;}
.fp-vrow{display:flex;flex-direction:column;gap:3px;}
.fp-vlabel{font-size:11px;color:#6b7280;}
.fp-vinput{
  padding:6px 8px;border:1px solid #d1d5db;border-radius:6px;
  font-size:12px;font-family:inherit;color:#111827;background:#fff;
  outline:none;transition:border-color .15s,box-shadow .15s;width:100%;
}
.fp-vinput:focus{border-color:#1a56db;box-shadow:0 0 0 2px rgba(26,86,219,.12);}
.fp-rbtn{
  padding:7px 0;width:100%;border:none;border-radius:7px;
  background:#1a56db;color:#fff;
  font-size:12px;font-weight:600;font-family:inherit;
  cursor:pointer;transition:opacity .15s;
}
.fp-rbtn:hover{opacity:.88}
.fp-rbtn--stop{background:#dc2626;}
.fp-rbtn-inline{
  margin-left:auto;padding:3px 8px;border:none;border-radius:5px;
  background:#1a56db;color:#fff;
  font-size:11px;font-weight:600;font-family:inherit;
  cursor:pointer;transition:opacity .15s;flex-shrink:0;
}
.fp-rbtn-inline:hover{opacity:.88}
.fp-rbtn-inline.fp-rbtn--stop{background:#dc2626;}
.fp-empty{
  padding:12px 14px;font-size:11px;color:#9ca3af;text-align:center;
}

/* ─── 日志 ───────────────────────────────────────────────────────────── */
.fp-log{border-top:1px solid #f3f4f6;padding:7px 12px;background:#f9fafb;}
.fp-ll{
  font-family:'Courier New',monospace;font-size:10px;color:#6b7280;
  line-height:1.6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}

/* ─── DOM 工具 ───────────────────────────────────────────────────────────── */
.fp-dom-tools{
  border-top:1px solid #f3f4f6;
  padding:8px 10px;
  display:flex;gap:6px;
}
.fp-dom-btn{
  flex:1;padding:6px 0;
  border:1px solid #d1d5db;border-radius:6px;
  background:#f9fafb;color:#374151;
  font-size:11px;font-weight:500;font-family:inherit;
  cursor:pointer;transition:background .12s,border-color .12s;
}
.fp-dom-btn:hover{background:#f3f4f6;border-color:#9ca3af;}
`
}
