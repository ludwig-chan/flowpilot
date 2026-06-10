import { ref, onUnmounted } from 'vue'
import type { Ref } from 'vue'
import type { LocalFlow } from '../stores/useFlowStore'
import type { RepeatingCandidate } from '@shared/types/message'
import { type BridgeEvent } from './useExtensionBridge'
import { useBridge } from './useBridge'

export function useSmartLoop(
  editingFlow: Ref<LocalFlow | null>,
  onLoopConfirm: (candidate: RepeatingCandidate) => void,
) {
  const bridge = useBridge()
  const showSmartLoopModal   = ref(false)
  const smartLoopCandidates  = ref<RepeatingCandidate[]>([])

  function onSmartLoopConfirm(candidate: RepeatingCandidate) {
    showSmartLoopModal.value = false
    bridge.clearLoopHighlights()
    onLoopConfirm(candidate)
  }

  const _handler = (evt: BridgeEvent) => {
    if (evt.type === 'SMART_LOOP_ANALYZED') {
      smartLoopCandidates.value = evt.candidates
      showSmartLoopModal.value  = true
    }
  }
  bridge.on(_handler)
  onUnmounted(() => bridge.off(_handler))

  return {
    showSmartLoopModal,
    smartLoopCandidates,
    onSmartLoopConfirm,
  }
}
