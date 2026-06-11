import { ref, computed } from 'vue'
import type { Ref } from 'vue'
import type { LocalFlow } from '../stores/useFlowStore'
import type { FlowStep, ConditionItem, ConditionLogic } from '@shared/types/flow'
import { useEditorStore } from '../stores/useEditorStore'
import { genId } from '@shared/utils/genId'
import { collectVarInfos, type VarInfo } from '@shared/utils/varAlias'

export function useConditionEditor(
  editingFlow: Ref<LocalFlow | null>,
  openPicker: (mode: 'single' | 'list') => void,
) {
  const es = useEditorStore()
  const showConditionModal = ref(false)
  const conditionModalStep = ref<FlowStep | null>(null)
  const conditionModalIdx  = ref<number | null>(null)
  const expandedConditions = ref(new Set<string>())

  /** 收集当前流程中所有 get_text 步骤的变量信息（递归），用于条件表达式变量提示 */
  const conditionAvailableVars = computed<VarInfo[]>(() => {
    if (!editingFlow.value?.steps) return []
    return collectVarInfos(editingFlow.value.steps)
  })

  function addConditionStep() {
    if (!editingFlow.value) return
    es.addingToBranch    = null   // 清除可能残留的分支上下文
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
    label: string; conditions: ConditionItem[]; logic: ConditionLogic
  }) {
    showConditionModal.value = false

    // 兼容旧格式：从第一个条件提取 value/selector，供 StepCard 等组件显示
    const firstCond = data.conditions[0]
    const compatSelector = firstCond?.mode === 'elem' && firstCond?.selector
      ? { cssSelector: firstCond.selector }
      : undefined
    const compatValue = firstCond?.mode === 'expr' ? firstCond?.value : undefined

    // 构建条件步骤的辅助函数
    function makeCondStep(): FlowStep {
      return {
        id:             genId('step'),
        type:           'condition',
        label:          data.label,
        conditions:     data.conditions,
        conditionLogic: data.logic,
        value:          compatValue,
        selector:       compatSelector,
        children:       [],
        elseChildren:   [],
      }
    }

    // ── 普通流程上下文 ────────────────────────────────────────────────
    if (!editingFlow.value) return
    // 分支内添加条件判断子步骤
    if (es.addingToBranch) {
      const { condStepId, branch } = es.addingToBranch
      const condStep = editingFlow.value.steps.find(s => s.id === condStepId)
      if (condStep) {
        const step = makeCondStep()
        if (branch === 'if') condStep.children = [...(condStep.children ?? []), step]
        else condStep.elseChildren = [...(condStep.elseChildren ?? []), step]
      }
      es.addingToBranch    = null
      conditionModalStep.value = null
      conditionModalIdx.value  = null
      return
    }
    if (conditionModalIdx.value !== null) {
      const s = editingFlow.value.steps[conditionModalIdx.value]
      s.label          = data.label
      s.conditions     = data.conditions
      s.conditionLogic = data.logic
      s.value          = compatValue
      s.selector       = compatSelector
    } else {
      editingFlow.value.steps.push(makeCondStep())
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
    es.addingToBranch = { condStepId, branch }
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
