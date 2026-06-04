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
  // 在元素内随机取一个点，而不是固定用中心点
  const x = rect.left + rect.width  * (0.3 + Math.random() * 0.4)
  const y = rect.top  + rect.height * (0.3 + Math.random() * 0.4)
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
