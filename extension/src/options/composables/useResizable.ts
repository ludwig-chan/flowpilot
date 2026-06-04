import { ref, onUnmounted } from 'vue'

export function useResizable() {
  // ── 侧边栏宽度 ────────────────────────────────────────────────
  const sidebarWidth = ref(320)
  let _resizing = false, _startX = 0, _startW = 0

  function startResize(e: MouseEvent) {
    _resizing = true; _startX = e.clientX; _startW = sidebarWidth.value
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onResizeMove)
    document.addEventListener('mouseup', stopResize)
    e.preventDefault()
  }

  function onResizeMove(e: MouseEvent) {
    if (!_resizing) return
    sidebarWidth.value = Math.max(180, Math.min(600, _startW + e.clientX - _startX))
  }

  function stopResize() {
    if (!_resizing) return
    _resizing = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    document.removeEventListener('mousemove', onResizeMove)
    document.removeEventListener('mouseup', stopResize)
  }

  // ── 日志抽屉高度 ──────────────────────────────────────────────
  const logDrawerHeight = ref(200)
  let _logResizing = false, _logStartY = 0, _logStartH = 0

  function startLogResize(e: MouseEvent) {
    _logResizing = true; _logStartY = e.clientY; _logStartH = logDrawerHeight.value
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onLogResizeMove)
    document.addEventListener('mouseup', stopLogResize)
    e.preventDefault()
  }

  function onLogResizeMove(e: MouseEvent) {
    if (!_logResizing) return
    logDrawerHeight.value = Math.max(80, Math.min(500, _logStartH + _logStartY - e.clientY))
  }

  function stopLogResize() {
    if (!_logResizing) return
    _logResizing = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    document.removeEventListener('mousemove', onLogResizeMove)
    document.removeEventListener('mouseup', stopLogResize)
  }

  // ── 进度抽屉高度 ──────────────────────────────────────────────
  const progressDrawerHeight = ref(180)
  let _progressResizing = false, _progressStartY = 0, _progressStartH = 0

  function startProgressResize(e: MouseEvent) {
    _progressResizing = true; _progressStartY = e.clientY; _progressStartH = progressDrawerHeight.value
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onProgressResizeMove)
    document.addEventListener('mouseup', stopProgressResize)
    e.preventDefault()
  }

  function onProgressResizeMove(e: MouseEvent) {
    if (!_progressResizing) return
    progressDrawerHeight.value = Math.max(80, Math.min(500, _progressStartH + _progressStartY - e.clientY))
  }

  function stopProgressResize() {
    if (!_progressResizing) return
    _progressResizing = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    document.removeEventListener('mousemove', onProgressResizeMove)
    document.removeEventListener('mouseup', stopProgressResize)
  }

  onUnmounted(() => {
    stopResize()
    stopLogResize()
    stopProgressResize()
  })

  return { sidebarWidth, logDrawerHeight, progressDrawerHeight, startResize, startLogResize, startProgressResize }
}
