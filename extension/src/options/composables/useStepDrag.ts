import { ref } from 'vue'
import type { Ref } from 'vue'
import type { LocalFlow } from '../stores/useFlowStore'

export interface BranchDropTarget {
  stepId:    string
  branch:    'if' | 'else'
  insertIdx: number
}

export function useStepDrag(editingFlow: Ref<LocalFlow | null>) {
  const dragSrcIdx       = ref<number | null>(null)
  const dragInsertIdx    = ref<number | null>(null)
  const branchDropTarget = ref<BranchDropTarget | null>(null)
  let _dragFromHandle    = false

  function onHandleMouseDown() { _dragFromHandle = true }

  function onDragStart(e: DragEvent, i: number) {
    if (!_dragFromHandle) { e.preventDefault(); return }
    _dragFromHandle = false
    dragSrcIdx.value = i
    e.dataTransfer!.effectAllowed = 'move'
  }

  function onDragOver(e: DragEvent, i: number) {
    e.preventDefault()
    e.dataTransfer!.dropEffect = 'move'
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    dragInsertIdx.value = e.clientY < rect.top + rect.height / 2 ? i : i + 1
  }

  function onTopInsertLineDragOver(i: number) {
    branchDropTarget.value = null
    dragInsertIdx.value    = i
  }

  function onDrop() {
    const src = dragSrcIdx.value
    const ins = dragInsertIdx.value
    if (src === null || ins === null || !editingFlow.value) return
    const steps = editingFlow.value.steps
    const [moved] = steps.splice(src, 1)
    const adjustedIns = ins > src ? ins - 1 : ins
    steps.splice(adjustedIns, 0, moved)
    dragSrcIdx.value    = null
    dragInsertIdx.value = null
  }

  function onBranchDragOver(stepId: string, branch: 'if' | 'else', insertIdx: number) {
    dragInsertIdx.value    = null
    branchDropTarget.value = { stepId, branch, insertIdx }
  }

  function onBranchDrop() {
    const src    = dragSrcIdx.value
    const target = branchDropTarget.value
    if (src === null || !target || !editingFlow.value) return
    const steps = editingFlow.value.steps
    // 不能把步骤拖入它自身的分支
    if (steps[src]?.id === target.stepId) {
      dragSrcIdx.value       = null
      branchDropTarget.value = null
      return
    }
    const [moved] = steps.splice(src, 1)
    const parent  = steps.find(s => s.id === target.stepId)
    if (!parent) {
      // 安全回滚：父步骤找不到时把步骤放回原位
      steps.splice(src, 0, moved)
      dragSrcIdx.value       = null
      branchDropTarget.value = null
      return
    }
    const arr = target.branch === 'if'
      ? (parent.children     ??= [])
      : (parent.elseChildren ??= [])
    arr.splice(target.insertIdx, 0, moved)
    dragSrcIdx.value       = null
    branchDropTarget.value = null
    dragInsertIdx.value    = null
  }

  function onDragEnd() {
    _dragFromHandle        = false
    dragSrcIdx.value       = null
    dragInsertIdx.value    = null
    branchDropTarget.value = null
  }

  return {
    dragSrcIdx, dragInsertIdx, branchDropTarget,
    onHandleMouseDown, onDragStart, onDragOver, onTopInsertLineDragOver,
    onDrop, onBranchDragOver, onBranchDrop, onDragEnd,
  }
}
