import { ref } from 'vue'
import type { Ref } from 'vue'
import type { LocalFlow } from '../stores/useFlowStore'

export function useStepDrag(editingFlow: Ref<LocalFlow | null>) {
  const dragSrcIdx    = ref<number | null>(null)
  const dragInsertIdx = ref<number | null>(null)
  let _dragFromHandle = false

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

  function onDragEnd() {
    _dragFromHandle     = false
    dragSrcIdx.value    = null
    dragInsertIdx.value = null
  }

  return { dragSrcIdx, dragInsertIdx, onHandleMouseDown, onDragStart, onDragOver, onDrop, onDragEnd }
}
