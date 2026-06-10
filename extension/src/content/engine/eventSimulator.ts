/** 在元素矩形内随机取一个点（30%~70% 范围，避免边缘） */
export function randomPosInRect(rect: DOMRect): { x: number; y: number } {
  return {
    x: rect.left + rect.width  * (0.3 + Math.random() * 0.4),
    y: rect.top  + rect.height * (0.3 + Math.random() * 0.4),
  }
}

export function humanDelay(min: number, max: number): Promise<void> {
  // Box-Muller 变换，模拟人类反应时间的正态分布（比均匀分布更难被行为分析识别）
  const u1 = Math.random() || 1e-10  // 避免 log(0)
  const u2 = Math.random()
  const normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  const mid = (min + max) / 2
  const sigma = (max - min) / 6
  const ms = Math.max(min, Math.min(max, mid + normal * sigma))
  return sleep(ms)
}

export function simulateClick(el: HTMLElement): void {
  const rect = el.getBoundingClientRect()
  const { x, y } = randomPosInRect(rect)
  const opts: MouseEventInit = {
    bubbles: true, cancelable: true,
    clientX: x, clientY: y,
    screenX: window.screenX + x, screenY: window.screenY + y,
    view: window,
  }
  el.dispatchEvent(new MouseEvent('mouseover',  opts))
  el.dispatchEvent(new MouseEvent('mousemove',  opts))
  el.dispatchEvent(new MouseEvent('mousedown',  { ...opts, button: 0, buttons: 1 }))
  el.dispatchEvent(new MouseEvent('mouseup',    { ...opts, button: 0, buttons: 0 }))
  el.dispatchEvent(new MouseEvent('click',      { ...opts, button: 0, buttons: 0 }))
}

// ─── 异步节奏化版本 ──────────────────────────────────────────────────────────

/** 坐标微扰：在基础值上加 ±range 像素偏移 */
function jitter(base: number, range: number): number {
  return base + Math.round((Math.random() - 0.5) * 2 * range)
}

/** 事件间微延迟：5~15ms，模拟真人鼠标操作节奏 */
function microDelay(): Promise<void> {
  return sleep(5 + Math.random() * 10)
}

/** 异步节奏化点击：事件之间有微延迟，坐标有微扰 */
export async function simulateClickAsync(el: HTMLElement): Promise<void> {
  const rect = el.getBoundingClientRect()
  const { x, y } = randomPosInRect(rect)
  const sx = window.screenX + x
  const sy = window.screenY + y

  // mouseover — 基础坐标
  el.dispatchEvent(new MouseEvent('mouseover', {
    bubbles: true, cancelable: true,
    clientX: x, clientY: y, screenX: sx, screenY: sy, view: window,
  }))
  await microDelay()

  // mousemove — 微扰 1-2px
  const mx = jitter(x, 2), my = jitter(y, 2)
  el.dispatchEvent(new MouseEvent('mousemove', {
    bubbles: true, cancelable: true,
    clientX: mx, clientY: my, screenX: jitter(sx, 2), screenY: jitter(sy, 2), view: window,
  }))
  await microDelay()

  // mousedown — 微扰 1-3px, button 0
  const dx = jitter(x, 3), dy2 = jitter(y, 3)
  el.dispatchEvent(new MouseEvent('mousedown', {
    bubbles: true, cancelable: true,
    clientX: dx, clientY: dy2, screenX: jitter(sx, 3), screenY: jitter(sy, 3),
    view: window, button: 0, buttons: 1,
  }))
  await sleep(8 + Math.random() * 12) // mousedown→mouseup 间隔稍长（8~20ms)

  // mouseup — 微扰 1-2px
  const ux = jitter(x, 2), uy = jitter(y, 2)
  el.dispatchEvent(new MouseEvent('mouseup', {
    bubbles: true, cancelable: true,
    clientX: ux, clientY: uy, screenX: jitter(sx, 2), screenY: jitter(sy, 2),
    view: window, button: 0, buttons: 0,
  }))
  await microDelay()

  // click — 微扰 1px
  const cx = jitter(x, 1), cy = jitter(y, 1)
  el.dispatchEvent(new MouseEvent('click', {
    bubbles: true, cancelable: true,
    clientX: cx, clientY: cy, screenX: jitter(sx, 1), screenY: jitter(sy, 1),
    view: window, button: 0, buttons: 0,
  }))
}

/** 异步节奏化双击：两次点击间隔 30~80ms，dblclick 坐标微扰 */
export async function dispatchDoubleClickAsync(el: HTMLElement): Promise<void> {
  await simulateClickAsync(el)
  await sleep(30 + Math.random() * 50) // 两次点击间隔 30~80ms
  const rect = el.getBoundingClientRect()
  const { x, y } = randomPosInRect(rect)
  el.dispatchEvent(new MouseEvent('dblclick', {
    bubbles: true, cancelable: true, detail: 2,
    clientX: jitter(x, 2), clientY: jitter(y, 2),
    screenX: jitter(window.screenX + x, 2), screenY: jitter(window.screenY + y, 2),
    view: window, button: 0, buttons: 0,
  }))
}

/** 异步节奏化右键：mousedown→mouseup→contextmenu，事件间有微延迟，坐标微扰 */
export async function dispatchRightClickAsync(el: HTMLElement): Promise<void> {
  const rect = el.getBoundingClientRect()
  const { x, y } = randomPosInRect(rect)
  const sx = window.screenX + x
  const sy = window.screenY + y

  el.dispatchEvent(new MouseEvent('mousedown', {
    bubbles: true, cancelable: true,
    clientX: jitter(x, 3), clientY: jitter(y, 3),
    screenX: jitter(sx, 3), screenY: jitter(sy, 3),
    view: window, button: 2, buttons: 2,
  }))
  await microDelay()

  el.dispatchEvent(new MouseEvent('mouseup', {
    bubbles: true, cancelable: true,
    clientX: jitter(x, 2), clientY: jitter(y, 2),
    screenX: jitter(sx, 2), screenY: jitter(sy, 2),
    view: window, button: 2, buttons: 0,
  }))
  await microDelay()

  el.dispatchEvent(new MouseEvent('contextmenu', {
    bubbles: true, cancelable: true,
    clientX: jitter(x, 1), clientY: jitter(y, 1),
    screenX: jitter(sx, 1), screenY: jitter(sy, 1),
    view: window, button: 2, buttons: 0,
  }))
}

/** 异步节奏化悬停：mouseenter→mouseover→mousemove，事件间有微延迟，坐标微扰 */
export async function dispatchHoverAsync(el: HTMLElement): Promise<void> {
  const rect = el.getBoundingClientRect()
  const { x, y } = randomPosInRect(rect)
  const sx = window.screenX + x
  const sy = window.screenY + y

  el.dispatchEvent(new MouseEvent('mouseenter', {
    bubbles: false, cancelable: true,
    clientX: x, clientY: y, screenX: sx, screenY: sy, view: window,
  }))
  await microDelay()

  el.dispatchEvent(new MouseEvent('mouseover', {
    bubbles: true, cancelable: true,
    clientX: jitter(x, 1), clientY: jitter(y, 1),
    screenX: jitter(sx, 1), screenY: jitter(sy, 1), view: window,
  }))
  await microDelay()

  el.dispatchEvent(new MouseEvent('mousemove', {
    bubbles: true, cancelable: true,
    clientX: jitter(x, 2), clientY: jitter(y, 2),
    screenX: jitter(sx, 2), screenY: jitter(sy, 2), view: window,
  }))
}

export function findScrollContainer(el: Element): HTMLElement {
  let cur = el.parentElement
  while (cur && cur !== document.body) {
    const style = window.getComputedStyle(cur)
    const oy = style.overflowY
    if ((oy === 'scroll' || oy === 'auto') && cur.scrollHeight > cur.clientHeight) return cur
    cur = cur.parentElement
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.body
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
