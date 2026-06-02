<script setup lang="ts">
import { ref } from 'vue'
import type { FlowStep } from '@shared/types/flow'
import BaseModal from '@shared/components/BaseModal.vue'
import BaseButton from '@shared/components/BaseButton.vue'
import BaseInput from '@shared/components/BaseInput.vue'

const props = defineProps<{
  step: FlowStep
}>()

const emit = defineEmits<{
  (e: 'save',          step: FlowStep): void
  (e: 'close'):                        void
  (e: 'reselect'):                     void
  (e: 'reselect-child', currentState: FlowStep): void
  (e: 'edit-child', childIdx: number, currentState: FlowStep): void
  (e: 'add-child',  currentState: FlowStep): void
}>()

const label     = ref(props.step.label)
const autoClick = ref(props.step.autoClickItem ?? false)
const delayMin  = ref(props.step.itemDelay?.[0] ?? 800)
const delayMax  = ref(props.step.itemDelay?.[1] ?? 2000)
const childSel  = ref(props.step.loopChildSelector ?? '')
const children  = ref<FlowStep[]>(JSON.parse(JSON.stringify(props.step.children ?? [])))

const ACTION_LABELS: Record<string, string> = {
  click: '点击', double_click: '双击', right_click: '右键', hover: '悬停',
  input: '输入文本', clear: '清空', select: '选择选项', check: '勾选',
  focus: '聚焦', press_key: '按键', get_text: '获取文字',
  wait_appear: '等待出现', wait_disappear: '等待消失',
  scroll_to: '滚动到', navigate: '导航', save_canvas: '截图',
  delay: '等待', loop_items: '循环列表', condition: '条件', call_flow: '嵌入流程',
}

function currentState(): FlowStep {
  return {
    ...props.step,
    label:             label.value.trim() || props.step.label,
    autoClickItem:     autoClick.value,
    itemDelay:         [Math.max(0, Number(delayMin.value) || 0), Math.max(0, Number(delayMax.value) || 0)],
    loopChildSelector: childSel.value || undefined,
    children:          children.value,
  }
}

function onSave() {
  emit('save', currentState())
}

function onEditChild(idx: number) {
  emit('edit-child', idx, currentState())
}

function onDeleteChild(idx: number) {
  children.value.splice(idx, 1)
}
</script>

<template>
  <BaseModal title="✏ 编辑循环步骤" width="500px" :z-index="1070" @close="emit('close')">

      <!-- 步骤名称 -->
      <div class="elm-section">
        <label class="elm-label">步骤名称</label>
        <BaseInput v-model="label" class="elm-input" placeholder="循环列表…" />
      </div>

      <!-- 循环选择器 -->
      <div class="elm-section">
        <label class="elm-label">循环选择器</label>
        <div class="elm-selector-row">
          <code class="elm-selector-val" :title="step.selector?.cssSelector">
            {{ step.selector?.cssSelector || '（未设置）' }}
          </code>
          <BaseButton class="elm-resel-btn" @click="emit('reselect')">重新选择…</BaseButton>
        </div>
      </div>

      <!-- 子元素路径 -->
      <div class="elm-section">
        <label class="elm-label">操作目标子元素路径</label>
        <div class="elm-selector-row">
          <code v-if="childSel" class="elm-selector-val" :title="childSel">{{ childSel }}</code>
          <span v-else class="elm-selector-empty">（未设置，将操作列表项本身）</span>
          <BaseButton class="elm-resel-btn" @click="emit('reselect-child', currentState())">重选子项…</BaseButton>
        </div>
      </div>

      <!-- 子动作列表 -->
      <div class="elm-section">
        <label class="elm-label">每项执行的动作</label>
        <div v-if="children.length === 0" class="elm-empty">暂无动作</div>
        <div v-for="(child, ci) in children" :key="child.id" class="elm-child-row">
          <span class="elm-child-type">{{ ACTION_LABELS[child.type] ?? child.type }}</span>
          <span class="elm-child-label" :title="child.label">{{ child.label }}</span>
          <div class="elm-child-actions">
            <BaseButton
              v-if="child.selector"
              variant="ghost"
              size="icon"
              class="elm-child-btn"
              title="编辑"
              @click="onEditChild(ci)"
            >✎</BaseButton>
            <BaseButton variant="ghost" size="icon" class="elm-child-btn elm-child-btn--del" title="删除" @click="onDeleteChild(ci)">✖</BaseButton>
          </div>
        </div>
      </div>

      <div class="elm-child-add">
        <BaseButton class="elm-add-btn" @click="emit('add-child', currentState())">＋ 添加操作</BaseButton>
      </div>

      <!-- 先点击选项 -->
      <div class="elm-section elm-section--row">
        <label class="elm-check-label">
          <input v-model="autoClick" type="checkbox" class="elm-checkbox" />
          先点击列表项本身再执行动作
        </label>
      </div>

      <!-- 每项间隔 -->
      <div class="elm-section">
        <label class="elm-label">每项处理间隔</label>
        <div class="elm-delay-row">
          <span class="elm-delay-hint">最短</span>
          <BaseInput v-model="delayMin" class="elm-delay-input" type="number" min="0" step="100" />
          <span class="elm-delay-hint">ms &nbsp; 最长</span>
          <BaseInput v-model="delayMax" class="elm-delay-input" type="number" min="0" step="100" />
          <span class="elm-delay-hint">ms</span>
        </div>
      </div>

      <!-- 底部 -->
      <template #footer>
        <BaseButton @click="emit('close')">取消</BaseButton>
        <BaseButton variant="primary" @click="onSave">保存</BaseButton>
      </template>

  </BaseModal>
</template>

<style lang="scss" scoped>
.elm-section {
  padding: 10px 14px;
  border-bottom: 1px solid #1a1a28;
  &--row { display: flex; align-items: center; gap: 8px; }
}

.elm-label {
  display: block; font-size: 11px; color: $color-text-muted; margin-bottom: 6px; font-weight: 600;
}

.elm-input { width: 100%; box-sizing: border-box; }

.elm-selector-row {
  display: flex; align-items: center; gap: 8px;
}

.elm-selector-val {
  flex: 1; min-width: 0;
  font-family: 'Cascadia Code', monospace; font-size: 11px; color: $color-green;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.elm-resel-btn { font-size: 11px; padding: 3px 10px; flex-shrink: 0; }

.elm-empty {
  font-size: 11px; color: $color-text-muted-2; text-align: center; padding: 8px 0;
}

.elm-child-row {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 0; border-bottom: 1px solid #1a1a28;
  &:last-child { border-bottom: none; }
}

.elm-selector-empty {
  flex: 1; font-size: 11px; color: $color-text-muted-2; font-style: italic;
}

.elm-child-type {
  font-size: 10px; background: $color-surface-1; color: $color-blue;
  padding: 1px 5px; border-radius: $radius-sm; flex-shrink: 0;
}

.elm-child-label {
  flex: 1; min-width: 0; font-size: 11px; color: $color-text;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.elm-child-actions { display: flex; gap: 2px; flex-shrink: 0; }

.elm-child-btn {
  padding: 1px 5px; font-size: 11px;
  &--del { color: $color-text-muted-2; &:hover { color: $color-red !important; } }
}

.elm-child-add { padding: 4px 14px 8px; }
.elm-add-btn {
  width: 100%; font-size: 11px; padding: 4px;
  border: 1px dashed $color-surface-2 !important; background: transparent; color: $color-text-muted;
  &:hover { border-color: $color-blue !important; color: $color-blue; }
}

.elm-check-label {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; color: $color-text; cursor: pointer;
}

.elm-checkbox { accent-color: $color-blue; cursor: pointer; }

.elm-delay-row {
  display: flex; align-items: center; gap: 6px;
}

.elm-delay-hint { font-size: 11px; color: $color-text-muted; flex-shrink: 0; }

.elm-delay-input { width: 80px; }
</style>
