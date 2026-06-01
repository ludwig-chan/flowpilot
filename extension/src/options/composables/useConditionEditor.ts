import { ref, computed } from 'vue'
import type { Ref } from 'vue'
import type { LocalFlow } from '../stores/useFlowStore'
import type { FlowStep } from '@shared/types/flow'

export function useConditionEditor(
  editingFlow: Ref<LocalFlow | null>,
  addingToBranch: Ref<{ condStepId: string; branch: 'if' | 'else' } | null>,
  openPicker: (mode: 'single' | 'list') => void,
) {
  const showConditionModal = ref(false)
  const conditionModalStep = ref<FlowStep | null>(null)
  const conditionModalIdx  = ref<number | null>(null)
  const expandedConditions = ref(new Set<string>())

  /** 收集当前流程中所有 get_text 步骤的变量名（递归），用于条件表达式变量提示 */
  const conditionAvailableVars = computed<string[]>(() => {
    const vars: string[] = []
    function collect(steps: FlowStep[]) {
      for (const s of steps) {
        if (s.type === 'get_text' && s.value?.trim()) vars.push(s.value.trim())
        if (s.children?.length) collect(s.children)
        if (s.elseChildren?.length) collect(s.elseChildren)
      }
    }
    if (editingFlow.value?.steps) collect(editingFlow.value.steps)
    return [...new Set(vars)]
  })

  function addConditionStep() {
    if (!editingFlow.value) return
    conditionModalStep.value = null
    conditionModalIdx.value  = null
    showConditionModal.value = true
  }

  /** 打开 ConditionPickerModal 编辑已有条件步骤 */
  function editConditionStep(step: FlowStep, idx: number) {
    conditionModalStep.value = step
    conditionModalIdx.value  = idx
    showConditionModal.value = true
  }

  /** ConditionPickerModal 确认回调 */
  function onConditionConfirm(data: {
    label: string; mode: 'expr' | 'elem'; value?: string; selector?: string
  }) {
    if (!editingFlow.value) return
    showConditionModal.value = false

    const newSelector = data.mode === 'elem' && data.selector
      ? { cssSelector: data.selector }
      : undefined
    const newValue = data.mode === 'expr' ? data.value : undefined

    if (conditionModalIdx.value !== null) {
      const s = editingFlow.value.steps[conditionModalIdx.value]
      s.label    = data.label
      s.value    = newValue
      s.selector = newSelector
    } else {
      editingFlow.value.steps.push({
        id:           `step_${Date.now()}`,
        type:         'condition',
        label:        data.label,
        value:        newValue,
        selector:     newSelector,
        children:     [],
        elseChildren: [],
      })
    }
    conditionModalStep.value = null
    conditionModalIdx.value  = null
  }

  /** 切换条件步骤的分支展开/收起 */
  function toggleConditionExpand(id: string) {
    const next = new Set(expandedConditions.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    expandedConditions.value = next
  }

  /** 删除分支内子步骤 */
  function removeBranchStep(condStepId: string, branch: 'if' | 'else', childIdx: number) {
    if (!editingFlow.value) return
    const condStep = editingFlow.value.steps.find(s => s.id === condStepId)
    if (!condStep) return
    if (branch === 'if') condStep.children?.splice(childIdx, 1)
    else condStep.elseChildren?.splice(childIdx, 1)
  }

  /** 在分支内添加新元素步骤 */
  function openBranchPicker(condStepId: string, branch: 'if' | 'else') {
    addingToBranch.value = { condStepId, branch }
    openPicker('single')
  }

  return {
    showConditionModal,
    conditionModalStep,
    conditionModalIdx,
    expandedConditions,
    conditionAvailableVars,
    addConditionStep,
    editConditionStep,
    onConditionConfirm,
    toggleConditionExpand,
    removeBranchStep,
    openBranchPicker,
  }
}
