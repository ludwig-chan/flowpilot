import { ref, onUnmounted } from 'vue'
import type { Ref } from 'vue'
import { type BridgeEvent } from './useExtensionBridge'
import { MSG } from '@shared/types/message'
import { useBridge } from './useBridge'
import type { SerializedDomNode } from '@shared/types/dom'
import { showAlert } from '@shared/utils/dialog'

const SCAN_TIMEOUT_MS = 10_000

export function useDomPicker(
  activeTabId: Ref<number | null>,
) {
  const bridge = useBridge()
  const domTree     = ref<SerializedDomNode[]>([])
  const domFilter   = ref('')
  const domScanning = ref(false)
  const domTabTitle = ref('')
  const domMutated  = ref(false)
  const pickMode    = ref(false)
  const pickedCssSelector      = ref('')
  const scopeCanonicalSelector = ref<string | undefined>(undefined)

  let scanTimer: ReturnType<typeof setTimeout> | null = null

  function clearScanTimer() {
    if (scanTimer !== null) { clearTimeout(scanTimer); scanTimer = null }
  }

  async function scanDom(scope?: string) {
    if (!activeTabId.value) { await showAlert('请先选择一个目标 Tab'); return }
    domScanning.value = true
    domMutated.value  = false
    domTree.value     = []
    clearScanTimer()
    scanTimer = setTimeout(() => {
      if (domScanning.value) {
        domScanning.value = false
        showAlert('扫描超时，请确认页面已加载完成后重试')
      }
    }, SCAN_TIMEOUT_MS)
    try {
      await bridge.requestDomScan(scope)
    } catch {
      clearScanTimer()
      domScanning.value = false
    }
  }

  async function togglePickMode(scope?: string) {
    if (!activeTabId.value) { await showAlert('请先选择一个目标 Tab'); return }
    if (pickMode.value) {
      pickMode.value = false
      await bridge.cancelPickElement()
    } else {
      pickMode.value = true
      await bridge.requestPickElement(scope)
    }
  }

  const handler = (evt: BridgeEvent) => {
    if (evt.type === MSG.DOM_SCAN_RESULT) {
      clearScanTimer()
      domScanning.value = false
      domTree.value     = evt.tree
      domTabTitle.value = evt.tabTitle
      scopeCanonicalSelector.value = evt.scopeCanonicalSelector
    }
    if (evt.type === MSG.ELEMENT_PICKED) {
      pickMode.value          = false
      pickedCssSelector.value = evt.cssSelector ?? ''
    }
  }
  bridge.on(handler)
  onUnmounted(() => { bridge.off(handler); clearScanTimer() })

  return { domTree, domFilter, domScanning, domMutated, domTabTitle, pickMode, pickedCssSelector, scopeCanonicalSelector, scanDom, togglePickMode }
}
