import { ref, computed } from 'vue'
import type { Ref } from 'vue'
import type { LocalFlow } from '../stores/useFlowStore'
import type { FlowStep } from '@shared/types/flow'
import { useEditorStore } from '../stores/useEditorStore'
import { genId } from '@shared/utils/genId'

export function useConditionEditor(
  editingFlow: Ref<LocalFlow | null>,
  openPicker: (mode: 'single' | 'list') => void,
) {
  const es = useEditorStore()
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
    showConditionModal.value = false

    const newSelector = data.mode === 'elem' && data.selector
      ? { cssSelector: data.selector }
      : undefined
    const newValue = data.mode === 'expr' ? data.value : undefined

    // ── Loop 上下文：写入 editingLoopStep ──────────────────────────────
    if (es.editingLoopStep) {
      const branchCtx = es.addingToLoopBranch
      if (branchCtx) {
        // 写入条件子步骤的 if/else 分支
        const cond = es.editingLoopStep.children?.find(c => c.id === branchCtx.condChildId)
        if (cond) {
          const arr = branchCtx.branch === 'if'
            ? (cond.children     = cond.children     ?? [])
            : (cond.elseChildren = cond.elseChildren ?? [])
          arr.push({
            id: genId('step'), type: 'condition', label: data.label,
            value: newValue, selector: newSelector, children: [], elseChildren: [],
          })
        }
        es.addingToLoopBranch = null
      } else {
        // 写入 loop 顶层 children
        const loopChildren = (es.editingLoopStep.children = es.editingLoopStep.children ?? [])
        const idx = es.editingLoopChild
        if (idx !== null && loopChildren[idx]) {
          // 编辑模式
          const s = loopChildren[idx]
          s.label = data.label; s.value = newValue; s.selector = newSelector
        } else {
          loopChildren.push({
            id: genId('step'), type: 'condition', label: data.label,
            value: newValue, selector: newSelector, children: [], elseChildren: [],
          })
        }
        es.editingLoopChild = null
      }
      conditionModalStep.value = null
      conditionModalIdx.value  = null
      es.showEditLoopModal = true
      return
    }

    // ── 普通流程上下文 ────────────────────────────────────────────────
    if (!editingFlow.value) return
    if (conditionModalIdx.value !== null) {
      const s = editingFlow.value.steps[conditionModalIdx.value]
      s.label    = data.label
      s.value    = newValue
      s.selector = newSelector
    } else {
      editingFlow.value.steps.push({
        id:           genId('step'),
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
