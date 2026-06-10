import { captureVisibleTabAsImage, waitForScrollRender } from './captureUtils'

/**
 * 对 canvas 元素截图，支持跨 iframe、虚拟渲染检测、多路径拼接。
 * 返回 PNG 的 data URL，失败返回 null。
 */
export async function screenshotCanvas(
  selector: string,
  onLog: (text: string) => void,
): Promise<string | null> {
  onLog(`  查找 canvas（选择器：${selector}）`)

  type CanvasHit = { canvas: HTMLCanvasElement; offX: number; offY: number; doc: Document; iframeEl: HTMLIFrameElement | null }

  function findCanvasInDoc(doc: Document, depth: number, offX: number, offY: number, parentIframe: HTMLIFrameElement | null): CanvasHit | null {
    const hit = doc.querySelector(selector)
    // 用 tagName 判断而非 instanceof：跨 frame 的 instanceof 永远 false
    if (hit?.tagName?.toLowerCase() === 'canvas') return { canvas: hit as HTMLCanvasElement, offX, offY, doc, iframeEl: parentIframe }
    if (hit) onLog(`  （深度${depth}）选择器匹配到 <${hit.tagName.toLowerCase()}>，不是 canvas`)

    for (const iframe of Array.from(doc.querySelectorAll('iframe'))) {
      try {
        const child = (iframe as HTMLIFrameElement).contentDocument
        if (!child) continue
        const fr = (iframe as HTMLIFrameElement).getBoundingClientRect()
        const found = findCanvasInDoc(child, depth + 1, offX + fr.left, offY + fr.top, iframe as HTMLIFrameElement)
        if (found) return found
      } catch { /* 跨域，跳过 */ }
    }
    return null
  }

  const hit    = findCanvasInDoc(document, 0, 0, 0, null)
  const canvas = hit?.canvas ?? null

  if (!canvas) {
    const allCanvases = Array.from(document.querySelectorAll('canvas'))
    if (allCanvases.length) {
      onLog(`  [诊断] 主文档共有 ${allCanvases.length} 个 canvas，id 分别为：${allCanvases.map(c => c.id || '(无id)').join('、')}`)
    } else {
      onLog('  [诊断] 主文档未发现任何 canvas 元素（可能全部在 iframe 内）')
    }
    onLog('  [跳过] 未找到 canvas 元素')
    return null
  }

  const { offX: iframeOffX, offY: iframeOffY } = hit!
  onLog(`  找到 canvas（${canvas.width}×${canvas.height}）${iframeOffX || iframeOffY ? `，所在 iframe 偏移=(${Math.round(iframeOffX)},${Math.round(iframeOffY)})` : ''}`)

  const dpr       = window.devicePixelRatio || 1
  const canvasDoc = hit!.doc

  // 必须用 canvas 所在 document 的 window 读取 computedStyle，
  // 否则跨 iframe 时 getComputedStyle 返回外层样式，导致找不到滚动容器
  function findScrollParent(el: Element, doc: Document): Element | null {
    const win = doc.defaultView ?? window
    let cur: Element | null = el.parentElement
    while (cur && cur !== doc.documentElement) {
      const oy = win.getComputedStyle(cur).overflowY
      if ((oy === 'scroll' || oy === 'auto' || oy === 'hidden') && cur.scrollHeight > cur.clientHeight + 1) return cur
      cur = cur.parentElement
    }
    const de = doc.documentElement
    if (de.scrollHeight > de.clientHeight + 1) return de
    return null
  }

  // 打印完整祖先链（iframe 内 + 外层文档），显示 canvas 在外层视口的真实坐标
  ;(function logAncestors() {
    const iframeElForLog = hit!.iframeEl
    const win = canvasDoc.defaultView ?? window
    let cur: Element | null = canvas.parentElement
    let depth = 0
    while (cur) {
      const oy  = win.getComputedStyle(cur).overflowY
      const tag = cur.tagName.toLowerCase()
      const id  = cur.id ? `#${cur.id}` : ''
      const cls = cur.className && typeof cur.className === 'string'
        ? `.${cur.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''
      onLog(`  [内祖先${depth}] <${tag}${id}${cls}> overflowY=${oy} ` +
            `clientH=${cur.clientHeight} scrollH=${cur.scrollHeight} scrollTop=${Math.round(cur.scrollTop)}`)
      cur = cur.parentElement
      depth++
      if (depth > 12) { onLog('  [内祖先] 已截断（超过12层）'); break }
    }
    const cr   = canvas.getBoundingClientRect()
    const absL = iframeOffX + cr.left
    const absT = iframeOffY + cr.top
    onLog(`  [canvas位置] 外层视口坐标=(${Math.round(absL)},${Math.round(absT)}) ` +
          `尺寸=${Math.round(cr.width)}×${Math.round(cr.height)} ` +
          `下边缘=${Math.round(absT + cr.height)} 视口H=${window.innerHeight} ` +
          `溢出下=${Math.max(0, Math.round(absT + cr.height - window.innerHeight))}px ` +
          `溢出右=${Math.max(0, Math.round(absL + cr.width - window.innerWidth))}px`)
    if (iframeElForLog) {
      let outer: Element | null = iframeElForLog.parentElement
      let od = 0
      while (outer && outer !== document.documentElement) {
        const oy  = window.getComputedStyle(outer).overflowY
        const tag = outer.tagName.toLowerCase()
        const id  = outer.id ? `#${outer.id}` : ''
        const cls = outer.className && typeof outer.className === 'string'
          ? `.${outer.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''
        onLog(`  [外祖先${od}] <${tag}${id}${cls}> overflowY=${oy} ` +
              `clientH=${outer.clientHeight} scrollH=${outer.scrollHeight} scrollTop=${Math.round(outer.scrollTop)}`)
        outer = outer.parentElement
        od++
        if (od > 8) { onLog('  [外祖先] 已截断（超过8层）'); break }
      }
    }
  })()

  const scrollEl   = findScrollParent(canvas, canvasDoc)
  const canvasCssH = canvas.height / dpr
  // 「document.documentElement 可滚动」只是页面可滚动，不代表 canvas 是虚拟渲染器。
  // 只有具体的非文档根滚动容器（overflow div 等）才认为是虚拟渲染。
  const isVirtual  = scrollEl !== null
    && scrollEl !== canvasDoc.documentElement
    && canvasCssH < scrollEl.scrollHeight - 1

  // 若 canvas 在 iframe 内，搜索外层文档的可滚动祖先（对话框 div 或外层容器）
  // 条件：无内层滚动容器，或内层仅为 iframe 文档根（外层容器才是真正的滚动驱动者）
  const iframeEl = hit!.iframeEl
  const iframeDocScrolls = scrollEl === canvasDoc.documentElement
  let outerScrollEl: Element | null = null
  if ((!scrollEl || iframeDocScrolls) && iframeEl) {
    let cur: Element | null = iframeEl.parentElement
    while (cur && cur !== document.documentElement) {
      const oy = window.getComputedStyle(cur).overflowY
      if ((oy === 'scroll' || oy === 'auto' || oy === 'hidden') && cur.scrollHeight > cur.clientHeight + 1) {
        outerScrollEl = cur; break
      }
      cur = cur.parentElement
    }
  }

  if (isVirtual && scrollEl) {
    onLog(`  找到内层滚动容器（虚拟渲染）<${scrollEl.tagName.toLowerCase()}>` +
          ` scrollH=${Math.round(scrollEl.scrollHeight)}，` +
          `canvas像素高=${canvas.height}（${Math.round(canvasCssH)}px）`)
  } else if (outerScrollEl) {
    onLog(`  canvas 在 iframe 内，外层滚动容器 <${outerScrollEl.tagName.toLowerCase()}>` +
          ` scrollH=${Math.round(outerScrollEl.scrollHeight)} clientH=${Math.round(outerScrollEl.clientHeight)}，` +
          `将滚动外层容器逐帧拼接（canvas 随外层滚动重绘）`)
  } else if (scrollEl) {
    onLog(`  iframe 文档可滚动 scrollH=${Math.round(scrollEl.scrollHeight)}，` +
          `无外层滚动容器，视为当前帧完整`)
  } else {
    onLog('  未找到任何滚动容器，canvas 应完全在视口内')
  }

  let dataUrl: string | null = null

  // ── 方案 A：直接读像素（同源 canvas，非虚拟渲染，且无外层滚动容器驱动重绘）──────
  // 若有外层滚动容器（iframe 被外层 div 驱动滚动），方案A只能拍当前帧，跳过走路径①b
  if (!isVirtual && !outerScrollEl) {
    try {
      const offscreen = document.createElement('canvas')
      offscreen.width  = canvas.width
      offscreen.height = canvas.height
      const offCtx = offscreen.getContext('2d')!
      offCtx.fillStyle = '#ffffff'
      offCtx.fillRect(0, 0, offscreen.width, offscreen.height)
      offCtx.drawImage(canvas, 0, 0)
      dataUrl = offscreen.toDataURL('image/png')
      onLog('  [方案A] 直接读取像素成功（已合并白色背景）')
    } catch {
      onLog('  [方案A] canvas 被跨域内容污染，降级到截屏方案...')
    }
  } else if (outerScrollEl) {
    onLog('  [方案A] 跳过：存在外层滚动容器，方案A仅拍当前帧，走路径①b逐帧拼接')
  } else {
    onLog('  [方案A] 跳过：检测到虚拟滚动，直接使用截屏拼接方案')
  }

  // ── 方案 B：background 截取可见区域，content script 侧滚动裁剪拼接 ────────
  if (!dataUrl) {
    try {
      if (isVirtual && scrollEl) {
        // 路径①a：虚拟渲染 canvas，通过内层滚动容器分块（canvas 内容随滚动重绘）
        const cropRect      = scrollEl.getBoundingClientRect()
        const cropLeft      = iframeOffX + cropRect.left
        const cropTop       = iframeOffY + cropRect.top
        const cropW         = scrollEl.clientWidth
        const cropH         = scrollEl.clientHeight
        const totalH        = scrollEl.scrollHeight
        const rows          = Math.ceil(totalH / cropH)
        const origScrollTop = scrollEl.scrollTop
        const out    = document.createElement('canvas')
        out.width    = Math.round(cropW * dpr)
        out.height   = Math.round(totalH * dpr)
        const outCtx = out.getContext('2d')!

        onLog(`  [方案B路径①a] 内层滚动容器 <${scrollEl.tagName.toLowerCase()}>，` +
              `可见=${Math.round(cropW)}×${Math.round(cropH)} 总高=${Math.round(totalH)} 分${rows}块 dpr=${dpr}`)
        onLog(`  [方案B路径①a] 裁剪区域固定 @(${Math.round(cropLeft)},${Math.round(cropTop)})`)

        for (let r = 0; r < rows; r++) {
          scrollEl.scrollTop = r * cropH
          await waitForScrollRender()
          const actualTop = scrollEl.scrollTop
          const tileH     = Math.min(cropH, totalH - actualTop)
          const img       = await captureVisibleTabAsImage()
          outCtx.drawImage(
            img,
            Math.round(cropLeft * dpr), Math.round(cropTop * dpr),
            Math.round(cropW    * dpr), Math.round(tileH   * dpr),
            0,                          Math.round(actualTop * dpr),
            Math.round(cropW    * dpr), Math.round(tileH    * dpr),
          )
          onLog(`  [方案B路径①a] 块${r + 1}/${rows} scrollTop=${Math.round(actualTop)} tileH=${Math.round(tileH)}`)
        }
        scrollEl.scrollTop = origScrollTop
        dataUrl = out.toDataURL('image/png')
        onLog(`  [方案B路径①a] 拼接完成，输出约 ${Math.round(dataUrl.length * 0.75 / 1024)} KB`)

      } else if (outerScrollEl) {
        // 路径①b：外层滚动容器分块（canvas 是虚拟渲染器，随外层滚动重绘内容）
        const clientH       = outerScrollEl.clientHeight
        const totalH        = outerScrollEl.scrollHeight
        const steps         = Math.ceil(totalH / clientH)
        const origScrollTop = outerScrollEl.scrollTop
        const iframeRect0   = iframeEl!.getBoundingClientRect()
        const canvasRect0   = canvas.getBoundingClientRect()
        const cssW          = canvasRect0.width
        const cssH          = canvasRect0.height

        onLog(`  [方案B路径①b] 外层容器 clientH=${Math.round(clientH)} totalH=${Math.round(totalH)} steps=${steps} dpr=${dpr}`)
        onLog(`  [方案B路径①b] canvas 固定裁剪坐标 @(${Math.round(iframeRect0.left + canvasRect0.left)},${Math.round(iframeRect0.top + canvasRect0.top)}) 尺寸=${Math.round(cssW)}×${Math.round(cssH)}`)

        const out    = document.createElement('canvas')
        out.width    = Math.round(cssW   * dpr)
        out.height   = Math.round(totalH * dpr)
        const outCtx = out.getContext('2d')!

        // 等待 scrollTop 稳定（处理 CSS smooth-scroll 动画，最多 800ms）
        const waitScrollStable = (target: number): Promise<number> =>
          new Promise<number>(resolve => {
            outerScrollEl.scrollTop = target
            let prev = -1, stableCnt = 0
            const t0 = Date.now()
            const poll = (): void => {
              const v = outerScrollEl.scrollTop
              if (v === prev) { if (++stableCnt >= 2) { resolve(v); return } }
              else { prev = v; stableCnt = 0 }
              if (Date.now() - t0 > 800) { resolve(v); return }
              setTimeout(poll, 50)
            }
            setTimeout(poll, 50)
          })

        for (let step = 0; step < steps; step++) {
          const targetScrollTop = Math.min(step * clientH, totalH - clientH)
          const actualScrollTop = await waitScrollStable(targetScrollTop)
          await waitForScrollRender()
          const tileH           = Math.min(clientH, totalH - actualScrollTop)
          const iframeRect      = iframeEl!.getBoundingClientRect()
          const canvasRect      = canvas.getBoundingClientRect()
          const absLeft         = iframeRect.left + canvasRect.left
          const absTop          = iframeRect.top  + canvasRect.top
          const srcLeft         = Math.max(absLeft, 0)
          const srcTop          = Math.max(absTop, 0)
          const srcRight        = Math.min(absLeft + cssW, window.innerWidth)
          const srcBottom       = Math.min(absTop + tileH, window.innerHeight)
          const visibleW        = Math.max(0, srcRight - srcLeft)
          const visibleH        = Math.max(0, srcBottom - srcTop)
          const destX           = srcLeft - absLeft
          const destY           = actualScrollTop + (srcTop - absTop)

          onLog(`  [方案B路径①b] 步骤${step + 1}/${steps} scrollTop=${Math.round(actualScrollTop)} absTop=${Math.round(absTop)} tileH=${Math.round(tileH)}`)
          if (visibleW <= 0 || visibleH <= 0) {
            onLog(`  [方案B路径①b] 步骤${step + 1} canvas 不在视口内，跳过`); continue
          }

          const img = await captureVisibleTabAsImage()
          outCtx.drawImage(
            img,
            Math.round(srcLeft  * dpr), Math.round(srcTop  * dpr),
            Math.round(visibleW * dpr), Math.round(visibleH * dpr),
            Math.round(destX    * dpr), Math.round(destY    * dpr),
            Math.round(visibleW * dpr), Math.round(visibleH * dpr),
          )
        }
        outerScrollEl.scrollTop = origScrollTop
        dataUrl = out.toDataURL('image/png')
        onLog(`  [方案B路径①b] 拼接完成，输出约 ${Math.round(dataUrl.length * 0.75 / 1024)} KB`)

      } else {
        // 路径②：无滚动容器 → window.scrollTo 分块（主页面超长 canvas）
        const rectNow      = canvas.getBoundingClientRect()
        const cssW         = rectNow.width
        const cssH         = rectNow.height
        const viewportW    = window.innerWidth
        const viewportH    = window.innerHeight
        const absLeft      = iframeOffX + rectNow.left
        const absTop       = iframeOffY + rectNow.top
        const fullyVisible = absLeft >= 0 && absTop >= 0 && absLeft + cssW <= viewportW && absTop + cssH <= viewportH
        const cols         = Math.ceil(cssW / viewportW)
        const rows         = Math.ceil(cssH / viewportH)

        onLog(`  [方案B路径②] canvas外层坐标=(${Math.round(absLeft)},${Math.round(absTop)}) ` +
              `尺寸=${Math.round(cssW)}×${Math.round(cssH)} 视口=${viewportW}×${viewportH} ` +
              `完全可见=${fullyVisible} 分${cols}列×${rows}行 dpr=${dpr}`)

        if (fullyVisible) {
          const img = await captureVisibleTabAsImage()
          onLog(`  [方案B路径②] 截图尺寸 ${img.width}×${img.height}，开始裁剪...`)
          const tmp = document.createElement('canvas')
          tmp.width  = Math.round(cssW * dpr)
          tmp.height = Math.round(cssH * dpr)
          tmp.getContext('2d')!.drawImage(img, Math.round(absLeft * dpr), Math.round(absTop * dpr), tmp.width, tmp.height, 0, 0, tmp.width, tmp.height)
          dataUrl = tmp.toDataURL('image/png')
          onLog(`  [方案B路径②] 裁剪成功，输出约 ${Math.round(dataUrl.length * 0.75 / 1024)} KB`)
        } else {
          const origScrollX = window.scrollX
          const origScrollY = window.scrollY
          const pageLeft    = rectNow.left + origScrollX
          const pageTop     = rectNow.top  + origScrollY
          const out    = document.createElement('canvas')
          out.width    = Math.round(cssW * dpr)
          out.height   = Math.round(cssH * dpr)
          const outCtx = out.getContext('2d')!

          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              window.scrollTo(pageLeft + c * viewportW, pageTop + r * viewportH)
              await waitForScrollRender()
              const cur   = canvas.getBoundingClientRect()
              const img   = await captureVisibleTabAsImage()
              const tileX = c * viewportW
              const tileY = r * viewportH
              const tileW = Math.min(viewportW, cssW - tileX)
              const tileH = Math.min(viewportH, cssH - tileY)
              outCtx.drawImage(img, Math.round(cur.left * dpr), Math.round(cur.top * dpr), Math.round(tileW * dpr), Math.round(tileH * dpr), Math.round(tileX * dpr), Math.round(tileY * dpr), Math.round(tileW * dpr), Math.round(tileH * dpr))
              onLog(`  [方案B路径②] 块(${r},${c}) tileSize=${Math.round(tileW)}×${Math.round(tileH)}`)
            }
          }
          window.scrollTo(origScrollX, origScrollY)
          dataUrl = out.toDataURL('image/png')
          onLog(`  [方案B路径②] 拼接完成，共 ${rows * cols} 块，输出约 ${Math.round(dataUrl.length * 0.75 / 1024)} KB`)
        }
      }
    } catch (err) {
      onLog(`  [方案B] 截屏异常：${(err as Error).message}`)
    }
  }

  if (!dataUrl) onLog('  [跳过] 两种方案均失败，无法保存图片')
  return dataUrl
}
