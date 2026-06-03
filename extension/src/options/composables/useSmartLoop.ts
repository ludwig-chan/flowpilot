import { ref, onUnmounted } from 'vue'
import type { Ref } from 'vue'
import type { LocalFlow } from '../stores/useFlowStore'
import type { FlowStep } from '@shared/types/flow'
import type { RepeatingCandidate } from '@shared/types/message'
import type { SerializedElement } from '@shared/types/dom'
import { type BridgeEvent } from './useExtensionBridge'
import { useBridge } from './useBridge'

export function useSmartLoop(
  editingFlow: Ref<LocalFlow | null>,
  onLoopConfirm: (candidate: RepeatingCandidate) => void,
) {
  const bridge = useBridge()
  const showSmartLoopModal   = ref(false)
  const smartLoopCandidates  = ref<RepeatingCandidate[]>([])
  const smartLoopPickedEl    = ref<SerializedElement | null>(null)
  const smartLoopPickingMode = ref(false)

  async function openSmartPicker() {
    if (!editingFlow.value) { alert('请先打开一个流程'); return }
    smartLoopPickingMode.value = true
    await bridge.requestSmartLoopAnalyze()
  }

  function cancelSmartLoopPicking() {
    smartLoopPickingMode.value = false
    bridge.cancelPickElement()
  }

  function onSmartLoopConfirm(candidate: RepeatingCandidate) {
    showSmartLoopModal.value = false
    bridge.clearLoopHighlights()
    onLoopConfirm(candidate)
  }

  const _handler = (evt: BridgeEvent) => {
    if (evt.type === 'SMART_LOOP_ANALYZED') {
      smartLoopPickedEl.value   = evt.element
      smartLoopCandidates.value = evt.candidates
      showSmartLoopModal.value  = true
    }
  }
  bridge.on(_handler)
  onUnmounted(() => bridge.off(_handler))

  return {
    showSmartLoopModal,
    smartLoopCandidates,
    smartLoopPickedEl,
    smartLoopPickingMode,
    openSmartPicker,
    cancelSmartLoopPicking,
    onSmartLoopConfirm,
  }
}
