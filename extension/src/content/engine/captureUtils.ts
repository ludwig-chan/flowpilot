/**
 * 截取当前标签页可见区域，返回已加载的 HTMLImageElement。
 * 截图前自动隐藏 fp-widget-host 浮层，截图后恢复显示。
 */
export async function waitForScrollRender(delay = 80): Promise<void> {
  const nextFrame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()))
  await nextFrame()
  await nextFrame()
  if (delay > 0) await new Promise<void>(resolve => setTimeout(resolve, delay))
  await nextFrame()
}

export async function captureVisibleTabAsImage(): Promise<HTMLImageElement> {
  const widgetHost = document.getElementById('fp-widget-host') as HTMLElement | null
  if (widgetHost) widgetHost.style.display = 'none'
  try {
    const r = await chrome.runtime.sendMessage({ type: 'CAPTURE_CANVAS' }) as
      { ok: boolean; screenshotDataUrl?: string; error?: string } | undefined
    if (!r?.ok || !r.screenshotDataUrl) {
      throw new Error(r?.error ?? '截图失败（无数据）')
    }
    return new Promise<HTMLImageElement>((res, rej) => {
      const img = new Image()
      img.onload  = () => res(img)
      img.onerror = () => rej(new Error('截图图片加载失败'))
      img.src = r.screenshotDataUrl!
    })
  } finally {
    if (widgetHost) widgetHost.style.display = ''
  }
}
