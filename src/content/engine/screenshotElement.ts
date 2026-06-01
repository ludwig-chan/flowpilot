import { captureVisibleTabAsImage } from './captureUtils'

/**
 * 对任意 DOM 元素截图并拼接，返回 PNG data URL，失败返回 null。
 * - 路径①：元素自身可滚动（overflow:scroll/auto）→ 滚动内容分块拼接
 * - 路径②：元素完全在视口内 → 单次截图裁剪
 * - 路径②分块：元素超出视口 → window.scrollTo 分块拼接
 */
export async function screenshotElement(
  el: HTMLElement,
  onLog: (text: string) => void,
): Promise<string | null> {
  const dpr       = window.devicePixelRatio || 1
  const viewportW = window.innerWidth
  const viewportH = window.innerHeight

  el.scrollIntoView({ block: 'start', behavior: 'instant' as ScrollBehavior })
  await new Promise<void>(rs => setTimeout(rs, 100))

  const rect  = el.getBoundingClientRect()
  const cssW  = el.offsetWidth
  const cssH  = el.offsetHeight

  onLog(`  元素 <${el.tagName.toLowerCase()}> 尺寸 ${cssW}×${cssH}px，视口 ${viewportW}×${viewportH}px，dpr=${dpr}`)

  const out    = document.createElement('canvas')
  out.width    = Math.round(cssW * dpr)
  out.height   = Math.round(cssH * dpr)
  const outCtx = out.getContext('2d')!

  const elOverflowY    = window.getComputedStyle(el).overflowY
  const selfScrollable = el.scrollHeight > el.clientHeight + 1 &&
    (elOverflowY === 'scroll' || elOverflowY === 'auto')

  if (selfScrollable) {
    // ── 路径①：元素自身可滚动，滚动内部内容分块截图拼接 ─────────────────────
    const totalH        = el.scrollHeight
    const clientH       = el.clientHeight
    const rows          = Math.ceil(totalH / clientH)
    const origScrollTop = el.scrollTop
    out.height          = Math.round(totalH * dpr)

    onLog(`  [路径①] 元素自身可滚动 scrollH=${totalH} clientH=${clientH} 分${rows}块`)

    for (let r = 0; r < rows; r++) {
      el.scrollTop = r * clientH
      await new Promise<void>(rs => setTimeout(rs, 150))
      const actualTop = el.scrollTop
      const tileH     = Math.min(clientH, totalH - actualTop)
      const curRect   = el.getBoundingClientRect()
      const img       = await captureVisibleTabAsImage()
      outCtx.drawImage(
        img,
        Math.round(curRect.left * dpr), Math.round(curRect.top * dpr),
        Math.round(cssW         * dpr), Math.round(tileH       * dpr),
        0,                              Math.round(actualTop   * dpr),
        Math.round(cssW         * dpr), Math.round(tileH       * dpr),
      )
      onLog(`  [路径①] 块${r + 1}/${rows} scrollTop=${Math.round(actualTop)} tileH=${Math.round(tileH)}`)
    }
    el.scrollTop = origScrollTop

  } else {
    // ── 路径②：通过 window.scrollTo 将元素各区域滚入视口截图拼接 ─────────────
    const absLeft      = rect.left + window.scrollX
    const absTop       = rect.top  + window.scrollY
    const cols         = Math.ceil(cssW / viewportW)
    const rows         = Math.ceil(cssH / viewportH)
    const fullyVisible = rect.left >= 0 && rect.top >= 0 &&
      rect.left + cssW <= viewportW && rect.top + cssH <= viewportH

    onLog(`  [路径②] absPos=(${Math.round(absLeft)},${Math.round(absTop)}) 分${cols}列×${rows}行 完全可见=${fullyVisible}`)

    if (fullyVisible) {
      const img = await captureVisibleTabAsImage()
      outCtx.drawImage(
        img,
        Math.round(rect.left * dpr), Math.round(rect.top * dpr),
        Math.round(cssW      * dpr), Math.round(cssH     * dpr),
        0, 0,
        Math.round(cssW      * dpr), Math.round(cssH     * dpr),
      )
      onLog('  [路径②] 单次截图成功')
    } else {
      const origScrollX = window.scrollX
      const origScrollY = window.scrollY

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          window.scrollTo(absLeft + c * viewportW, absTop + r * viewportH)
          await new Promise<void>(rs => setTimeout(rs, 150))
          const curRect = el.getBoundingClientRect()
          const img     = await captureVisibleTabAsImage()
          const tileX   = c * viewportW
          const tileY   = r * viewportH
          const tileW   = Math.min(viewportW, cssW - tileX)
          const tileH   = Math.min(viewportH, cssH - tileY)
          outCtx.drawImage(
            img,
            Math.round(curRect.left * dpr), Math.round(curRect.top * dpr),
            Math.round(tileW        * dpr), Math.round(tileH       * dpr),
            Math.round(tileX        * dpr), Math.round(tileY       * dpr),
            Math.round(tileW        * dpr), Math.round(tileH       * dpr),
          )
          onLog(`  [路径②] 块(${r},${c}) tileSize=${Math.round(tileW)}×${Math.round(tileH)}`)
        }
      }
      window.scrollTo(origScrollX, origScrollY)
      onLog(`  [路径②] 拼接完成，共 ${rows * cols} 块`)
    }
  }

  return out.toDataURL('image/png')
}
