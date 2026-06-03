import { ref, onUnmounted } from 'vue'
import type { Ref } from 'vue'
import { useExtensionBridge, type BridgeEvent } from './useExtensionBridge'
import type { SerializedDomNode } from '@shared/types/dom'

type Bridge = ReturnType<typeof useExtensionBridge>

const SCAN_TIMEOUT_MS = 10_000

export function useDomPicker(
  bridge:      Bridge,
  activeTabId: Ref<number | null>,
) {
  const domTree     = ref<SerializedDomNode[]>([])
  const domFilter   = ref('')
  const domScanning = ref(false)
  const domTabTitle = ref('')
  const domMutated  = ref(false)
  const pickMode    = ref(false)
  const pickedCssSelector = ref('')

  let scanTimer: ReturnType<typeof setTimeout> | null = null

  function clearScanTimer() {
    if (scanTimer !== null) { clearTimeout(scanTimer); scanTimer = null }
  }

  async function scanDom() {
    if (!activeTabId.value) { alert('请先选择一个目标 Tab'); return }
    domScanning.value = true
    domMutated.value  = false
    domTree.value     = []
    clearScanTimer()
    scanTimer = setTimeout(() => {
      if (domScanning.value) {
        domScanning.value = false
        alert('扫描超时，请确认页面已加载完成后重试')
      }
    }, SCAN_TIMEOUT_MS)
    try {
      await bridge.requestDomScan()
    } catch {
      clearScanTimer()
      domScanning.value = false
    }
  }

  async function togglePickMode() {
    if (!activeTabId.value) { alert('请先选择一个目标 Tab'); return }
    if (pickMode.value) {
      pickMode.value = false
      await bridge.cancelPickElement()
    } else {
      pickMode.value = true
      await bridge.requestPickElement()
    }
  }

  const handler = (evt: BridgeEvent) => {
    if (evt.type === 'DOM_SCAN_RESULT') {
      clearScanTimer()
      domScanning.value = false
      domTree.value     = evt.tree
      domTabTitle.value = evt.tabTitle
    }
    if (evt.type === 'ELEMENT_PICKED') {
      pickMode.value          = false
      pickedCssSelector.value = evt.cssSelector ?? ''
    }
  }
  bridge.on(handler)
  onUnmounted(() => { bridge.off(handler); clearScanTimer() })

  return { domTree, domFilter, domScanning, domMutated, domTabTitle, pickMode, pickedCssSelector, scanDom, togglePickMode }
}
