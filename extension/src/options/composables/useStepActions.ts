import { ref } from 'vue'
import type { Ref } from 'vue'
import type { useFlowStore } from '../stores/useFlowStore'
import type { LocalFlow } from '../stores/useFlowStore'
import type { FlowStep } from '@shared/types/flow'

type FlowStore = ReturnType<typeof useFlowStore>

export const stepTypeLabels: Record<string, string> = {
  click: '点击', input: '输入', select: '选择', focus: '聚焦',
  get_text: '获取文字', wait_appear: '等待出现', wait_disappear: '等待消失',
  scroll_to: '滚动到', navigate: '导航', loop_items: '循环列表项', condition: '条件判断', element_branch: '元素分支',
  delay: '等待', press_key: '按键', call_flow: '嵌入流程', save_canvas: '截图',
}

export function useStepActions(editingFlow: Ref<LocalFlow | null>, flowStore: FlowStore) {
  function removeStep(index: number) { editingFlow.value?.steps.splice(index, 1) }

  const showDelayModal  = ref(false)
  const delayEditTarget = ref<FlowStep | null>(null)

  function addDelayStep() {
    if (!editingFlow.value) return
    delayEditTarget.value = null
    showDelayModal.value  = true
  }

  function editDelayStep(step: FlowStep) {
    delayEditTarget.value = step
    showDelayModal.value  = true
  }

  function onDelayConfirm(ms: number) {
    if (!editingFlow.value) return
    if (delayEditTarget.value) {
      delayEditTarget.value.value = String(ms)
      delayEditTarget.value.label = `等待 ${ms} ms`
    } else {
      editingFlow.value.steps.push({
        id:    `step_${Date.now()}`,
        type:  'delay',
        label: `等待 ${ms} ms`,
        value: String(ms),
      })
    }
    showDelayModal.value  = false
    delayEditTarget.value = null
  }

  const selectedStepIds = ref<string[]>([])

  function toggleSelect(id: string) {
    const idx = selectedStepIds.value.indexOf(id)
    if (idx >= 0) selectedStepIds.value.splice(idx, 1)
    else selectedStepIds.value.push(id)
  }

  function deleteSelected() {
    if (!editingFlow.value) return
    editingFlow.value.steps = editingFlow.value.steps.filter(s => !selectedStepIds.value.includes(s.id))
    selectedStepIds.value = []
  }

  const showCallFlowPicker = ref(false)

  function addCallFlowStep() {
    if (!editingFlow.value) return
    const others = flowStore.allFlows().filter(f => f.id !== editingFlow.value?.id)
    if (others.length === 0) { alert('没有可嵌入的其他流程'); return }
    showCallFlowPicker.value = true
  }

  function confirmCallFlow(id: string) {
    if (!editingFlow.value || !id) return
    const target = flowStore.allFlows().find(f => f.id === id)
    if (!target) return
    editingFlow.value.steps.push({
      id:      `step_${Date.now()}`,
      type:    'call_flow',
      label:   `嵌入流程：${target.name}`,
      flowRef: target.id,
    })
    showCallFlowPicker.value = false
  }

  return {
    removeStep, addDelayStep, editDelayStep, onDelayConfirm,
    showDelayModal, delayEditTarget,
    selectedStepIds, toggleSelect, deleteSelected,
    showCallFlowPicker, addCallFlowStep, confirmCallFlow,
  }
}
