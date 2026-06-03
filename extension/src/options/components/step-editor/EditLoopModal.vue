<script setup lang="ts">
import { ref, computed } from 'vue'
import type { FlowStep, ActionType } from '@shared/types/flow'
import BaseInput from '@shared/components/BaseInput.vue'

const props = defineProps<{
  step: FlowStep
}>()

const emit = defineEmits<{
  (e: 'save',          step: FlowStep): void
  (e: 'close'):                        void
  (e: 'reselect'):                     void
  (e: 'reselect-child', currentState: FlowStep): void
  (e: 'edit-child',    childIdx: number, currentState: FlowStep): void
  (e: 'add-child',      currentState: FlowStep): void
  (e: 'add-call-flow',  currentState: FlowStep): void
}>()

const label     = ref(props.step.label)
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

// ── 快速添加动作（loopChildSelector 已填时内联展开） ─────────────────
interface QuickActionOption {
  type:         ActionType
  label:        string
  needValue:    boolean
  placeholder?: string
}
const ACTION_QUICK_GROUPS: { label: string; options: QuickActionOption[] }[] = [
  {
    label: '鼠标',
    options: [
      { type: 'click',        label: '🖱 点击', needValue: false },
      { type: 'double_click', label: '🖱 双击', needValue: false },
      { type: 'right_click',  label: '🖱 右键', needValue: false },
      { type: 'hover',        label: '👆 悬停', needValue: false },
    ],
  },
  {
    label: '文本',
    options: [
      { type: 'input', label: '⌨️ 输入文本', needValue: true,  placeholder: '要输入的文本，支持 {{变量}}' },
      { type: 'clear', label: '🗑 清空文本',  needValue: false },
    ],
  },
  {
    label: '表单',
    options: [
      { type: 'select',    label: '🔽 选择选项', needValue: true,  placeholder: '选项值（value 属性）' },
      { type: 'check',     label: '☑ 勾选',      needValue: true,  placeholder: 'true / false / 留空=切换' },
      { type: 'focus',     label: '🎯 聚焦',      needValue: false },
      { type: 'press_key', label: '⌨️ 按键',      needValue: true,  placeholder: 'Enter、Tab、Escape…' },
    ],
  },
  {
    label: '数据',
    options: [
      { type: 'get_text',       label: '📋 获取文字', needValue: true,  placeholder: '存入变量名（如 myVar）' },
      { type: 'wait_appear',    label: '⏳ 等待出现', needValue: false },
      { type: 'wait_disappear', label: '🕐 等待消失', needValue: false },
      { type: 'scroll_to',      label: '📜 滚动到',   needValue: false },
    ],
  },
]
const ACTION_QUICK_OPTS = ACTION_QUICK_GROUPS.flatMap(g => g.options)

const showQuickAdd    = ref(false)
const quickType       = ref<ActionType>('click')
const quickValue      = ref('')
const currentQuickOpt = computed(
  () => ACTION_QUICK_OPTS.find(o => o.type === quickType.value) ?? ACTION_QUICK_OPTS[0]
)

function handleAddChild() {
  if (childSel.value) {
    showQuickAdd.value = !showQuickAdd.value
  } else {
    emit('add-child', currentState())
  }
}

function onQuickConfirm() {
  const opt    = currentQuickOpt.value
  const action = opt.label.replace(/^\S+\s*/, '')
  const child: FlowStep = {
    id:               `step_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    type:             quickType.value,
    label:            `${action}：${childSel.value.slice(0, 30)}`,
    selector:         { cssSelector: childSel.value },
    relativeSelector: true,
    value:            opt.needValue && quickValue.value.trim() ? quickValue.value.trim() : undefined,
  }
  children.value.push(child)
  showQuickAdd.value = false
  quickValue.value   = ''
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
        <div class="elm-add-buttons">
          <BaseButton class="elm-add-btn" @click="handleAddChild">＋ 添加操作</BaseButton>
          <BaseButton class="elm-add-btn elm-add-btn--flow" @click="emit('add-call-flow', currentState())">＋ 嵌入流程</BaseButton>
        </div>

        <!-- 快速选动作面板（有 loopChildSelector 时展开） -->
        <div v-if="showQuickAdd" class="elm-quick-add">
          <div class="elm-quick-row">
            <select
              class="elm-quick-select"
              :value="quickType"
              @change="quickType = ($event.target as HTMLSelectElement).value as ActionType; quickValue = ''"
            >
              <optgroup v-for="g in ACTION_QUICK_GROUPS" :key="g.label" :label="g.label">
                <option v-for="opt in g.options" :key="opt.type" :value="opt.type">{{ opt.label }}</option>
              </optgroup>
            </select>
            <BaseInput
              v-if="currentQuickOpt.needValue"
              v-model="quickValue"
              class="elm-quick-value"
              :placeholder="currentQuickOpt.placeholder || ''"
            />
          </div>
          <div class="elm-quick-row elm-quick-row--actions">
            <button class="elm-quick-link" @click="showQuickAdd = false; emit('add-child', currentState())">选择其他元素…</button>
            <BaseButton variant="primary" class="elm-quick-confirm" @click="onQuickConfirm">确认添加</BaseButton>
          </div>
        </div>
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
.elm-add-buttons {
  display: flex; gap: 6px;
}

.elm-add-btn {
  flex: 1; font-size: 11px; padding: 4px;
  border: 1px dashed $color-surface-2 !important; background: transparent; color: $color-text-muted;
  &:hover { border-color: $color-blue !important; color: $color-blue; }
  &--flow {
    &:hover { border-color: $color-green !important; color: $color-green; }
  }
}

.elm-quick-add {
  margin-top: 6px; padding: 8px;
  background: $color-surface-1; border: 1px solid $color-surface-2; border-radius: $radius;
  display: flex; flex-direction: column; gap: 6px;
}

.elm-quick-row {
  display: flex; align-items: center; gap: 6px;
  &--actions { justify-content: space-between; }
}

.elm-quick-select {
  flex: 1; background: $color-base; border: 1px solid $color-surface-2; border-radius: $radius-sm;
  color: $color-text; padding: 4px 6px; font-size: 11px; cursor: pointer;
  &:focus { outline: none; border-color: $color-blue; }
}

.elm-quick-value { flex: 1; }

.elm-quick-link {
  font-size: 11px; color: $color-text-muted; background: none; border: none;
  cursor: pointer; padding: 0; text-decoration: underline;
  &:hover { color: $color-blue; }
}

.elm-quick-confirm { font-size: 11px; padding: 3px 10px; }

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
