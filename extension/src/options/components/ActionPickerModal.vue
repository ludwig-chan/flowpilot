<script setup lang="ts">
import { ref, computed } from 'vue'
import type { SerializedElement } from '@shared/types/dom'
import type { FlowStep, ActionType } from '@shared/types/flow'

interface ActionOption {
  type:              ActionType
  label:             string
  needValue:         boolean
  valuePlaceholder?: string
}

interface ActionGroup {
  label:   string
  options: ActionOption[]
}

const ACTION_GROUPS: ActionGroup[] = [
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
      { type: 'input', label: '⌨️ 输入文本', needValue: true,  valuePlaceholder: '要输入的文本，支持 {{变量}}' },
      { type: 'clear', label: '🗑 清空文本', needValue: false },
    ],
  },
  {
    label: '表单',
    options: [
      { type: 'select',    label: '🔽 选择选项', needValue: true,  valuePlaceholder: '选项值（value 属性）' },
      { type: 'check',     label: '☑ 勾选',      needValue: true,  valuePlaceholder: 'true=勾选 / false=取消 / 留空=切换' },
      { type: 'focus',     label: '🎯 聚焦',     needValue: false },
      { type: 'press_key', label: '⌨️ 按键',     needValue: true,  valuePlaceholder: 'Enter、Tab、Escape、Space、ArrowDown…' },
    ],
  },
  {
    label: '数据 & 等待',
    options: [
      { type: 'get_text',       label: '📋 获取文字', needValue: true,  valuePlaceholder: '存入变量名（如 myVar）' },
      { type: 'wait_appear',    label: '⏳ 等待出现', needValue: false },
      { type: 'wait_disappear', label: '🕐 等待消失', needValue: false },
    ],
  },
  {
    label: '页面',
    options: [
      { type: 'scroll_to',          label: '📜 滚动到',    needValue: false },
      { type: 'save_canvas',        label: '📷 截图',      needValue: false },
    ],
  },
]

const ACTION_OPTIONS = ACTION_GROUPS.flatMap(g => g.options)

const props = defineProps<{
  element:             SerializedElement
  overrideSel?:        string
  isRelative?:         boolean
  initialType?:        ActionType
  initialValue?:       string
  initialLabel?:       string
  initialWaitTimeout?: number
  initialFoundDelay?:  [number, number]
}>()

const emit = defineEmits<{
  (e: 'confirm', step: FlowStep): void
  (e: 'try',     step: FlowStep): void
  (e: 'cancel'): void
  (e: 're-pick', type: ActionType, value: string | undefined): void
}>()

function inferDefault(el: SerializedElement): ActionType {
  if (el.kind === 'input')  return 'input'
  if (el.kind === 'select') return 'select'
  return 'click'
}

const selectedType      = ref<ActionType>(props.initialType ?? inferDefault(props.element))
const inputValue        = ref(props.initialValue ?? '')
const stepLabel         = ref(props.initialLabel ?? '')
const tryState          = ref<'idle' | 'running' | 'done'>('idle')
const stepWaitTimeout   = ref<number | undefined>(props.initialWaitTimeout)
const stepFoundDelayMin = ref<number | undefined>(props.initialFoundDelay?.[0])
const stepFoundDelayMax = ref<number | undefined>(props.initialFoundDelay?.[1])

const currentOpt = computed(() => ACTION_OPTIONS.find(o => o.type === selectedType.value)!)

const displaySel = computed(() => props.overrideSel ?? props.element.selector.cssSelector)
const autoLabel  = computed(() => {
  const base   = (props.element.label || displaySel.value).slice(0, 36)
  const action = currentOpt.value.label.replace(/^\S+\s*/, '')
  return `${action}：${base}`
})

function buildStep(): FlowStep {
  const sel   = props.overrideSel
    ? { ...props.element.selector, cssSelector: props.overrideSel }
    : props.element.selector
  const fdMin = stepFoundDelayMin.value ?? 0
  const fdMax = stepFoundDelayMax.value ?? 0
  return {
    id:               `step_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    type:             selectedType.value,
    label:            stepLabel.value.trim() || autoLabel.value,
    selector:         sel,
    value:            inputValue.value.trim() || undefined,
    relativeSelector: props.isRelative || undefined,
    waitTimeout:      stepWaitTimeout.value || undefined,
    foundDelay:       (fdMin > 0 || fdMax > 0) ? [fdMin, fdMax] : undefined,
  }
}

function confirm() {
  emit('confirm', buildStep())
}

function tryAction() {
  emit('try', buildStep())
  tryState.value = 'running'
  setTimeout(() => { tryState.value = 'done'  }, 1200)
  setTimeout(() => { tryState.value = 'idle'  }, 3000)
}
</script>

<template>
  <div class="action-overlay" @click.self="emit('cancel')">
    <div class="action-modal">

      <div class="action-modal__header">
        <span class="action-modal__title">选择动作</span>
        <button class="btn btn--ghost btn--icon" @click="emit('cancel')">✖</button>
      </div>

      <div class="action-modal__sel">
        <span class="action-modal__sel-label">选中元素：</span>
        <code class="action-modal__sel-code" :title="displaySel">{{ displaySel }}</code>
        <span v-if="isRelative" class="action-modal__rel-badge">相对路径</span>
        <button
          class="btn btn--ghost action-modal__repick-btn"
          title="重新选择元素"
          @click="emit('re-pick', selectedType, inputValue.trim() || undefined)"
        >🎯 换元素</button>
      </div>

      <div class="action-modal__body">
        <div class="action-modal__name-row">
          <span class="action-modal__name-label">步骤名称</span>
          <input
            class="input action-modal__name-input"
            v-model="stepLabel"
            :placeholder="autoLabel"
          />
        </div>
        <div class="action-modal__action-row">
          <span class="action-modal__action-label">动作</span>
          <select
            class="action-modal__action-select"
            :value="selectedType"
            @change="selectedType = ($event.target as HTMLSelectElement).value as ActionType; inputValue = ''"
          >
            <optgroup v-for="group in ACTION_GROUPS" :key="group.label" :label="group.label">
              <option v-for="opt in group.options" :key="opt.type" :value="opt.type">{{ opt.label }}</option>
            </optgroup>
          </select>
        </div>
        <div v-if="currentOpt.needValue" class="action-modal__value-row">
          <span class="action-modal__value-label">值</span>
          <input
            class="input"
            v-model="inputValue"
            :placeholder="currentOpt.valuePlaceholder"
          />
        </div>
        <div class="action-modal__timing-row">
          <span class="action-modal__timing-label">超时</span>
          <input
            type="number" min="0" step="1000"
            class="action-modal__timing-input"
            placeholder="使用流程默认"
            :value="stepWaitTimeout ?? ''"
            @change="stepWaitTimeout = Number(($event.target as HTMLInputElement).value) || undefined"
          />
          <span class="action-modal__timing-unit">ms</span>
          <span class="action-modal__timing-sep">｜出现后延迟</span>
          <input
            type="number" min="0" step="100"
            class="action-modal__timing-input"
            placeholder="最小"
            :value="stepFoundDelayMin ?? ''"
            @change="stepFoundDelayMin = Number(($event.target as HTMLInputElement).value) || undefined"
          />
          <span class="action-modal__timing-tilde">~</span>
          <input
            type="number" min="0" step="100"
            class="action-modal__timing-input"
            placeholder="最大"
            :value="stepFoundDelayMax ?? ''"
            @change="stepFoundDelayMax = Number(($event.target as HTMLInputElement).value) || undefined"
          />
          <span class="action-modal__timing-unit">ms</span>
        </div>
      </div>

      <div class="action-modal__footer">
        <button class="btn" @click="emit('cancel')">取消</button>
        <button
          :class="['btn', 'btn--try', { 'btn--try--done': tryState === 'done' }]"
          :disabled="tryState === 'running'"
          @click="tryAction"
        >
          {{ tryState === 'running' ? '⏳ 执行中…' : tryState === 'done' ? '✓ 已执行' : '▷ 试一下' }}
        </button>
        <button class="btn btn--primary" @click="confirm">确定</button>
      </div>

    </div>
  </div>
</template>

<style lang="scss" scoped>
.action-overlay {
  position: fixed; inset: 0; z-index: 1100;
  background: rgba(0, 0, 0, .55);
  display: flex; align-items: center; justify-content: center;
}

.action-modal {
  width: 480px; max-width: 92vw;
  background: #1e1e2e; border: 1px solid #45475a; border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, .5);
  display: flex; flex-direction: column; overflow: hidden;

  &__header {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 14px; border-bottom: 1px solid #313244; flex-shrink: 0;
  }
  &__title { font-weight: 700; font-size: 14px; flex: 1; }

  &__sel {
    display: flex; align-items: center; gap: 6px;
    padding: 7px 14px; background: #181825; border-bottom: 1px solid #313244; flex-shrink: 0;
  }
  &__sel-label { font-size: 11px; color: #6c7086; flex-shrink: 0; }
  &__sel-code {
    font-family: 'Cascadia Code', monospace; font-size: 11px; color: #89dceb;
    overflow-x: auto; white-space: nowrap; flex: 1; min-width: 0;
    scrollbar-width: thin; scrollbar-color: #45475a transparent;
  }
  &__rel-badge {
    font-size: 10px; background: #1e3a5f; color: #89b4fa;
    padding: 1px 6px; border-radius: 99px; flex-shrink: 0;
  }

  &__repick-btn { font-size: 11px; padding: 2px 8px; flex-shrink: 0; }

  &__body {
    padding: 12px 14px; display: flex; flex-direction: column; gap: 10px;
  }
  &__name-row   { display: flex; align-items: center; gap: 8px; }
  &__name-label { font-size: 11px; color: #6c7086; flex-shrink: 0; width: 52px; }
  &__name-input { flex: 1; }
  &__action-row { display: flex; align-items: center; gap: 8px; }
  &__action-label { font-size: 11px; color: #6c7086; flex-shrink: 0; width: 52px; }
  &__action-select {
    flex: 1; background: #313244; border: 1px solid #45475a; border-radius: 4px;
    color: #cdd6f4; padding: 5px 8px; font-size: 12px; cursor: pointer;
    &:focus { outline: none; border-color: #89b4fa; }
  }
  &__value-row { display: flex; align-items: center; gap: 8px; }
  &__value-label { font-size: 11px; color: #6c7086; flex-shrink: 0; width: 52px; }

  &__timing-row {
    display: flex; align-items: center; flex-wrap: wrap; gap: 5px;
    padding-top: 8px; border-top: 1px solid #313244;
  }
  &__timing-label { font-size: 11px; color: #6c7086; flex-shrink: 0; }
  &__timing-sep   { font-size: 11px; color: #6c7086; flex-shrink: 0; margin-left: 2px; }
  &__timing-tilde { font-size: 11px; color: #6c7086; }
  &__timing-unit  { font-size: 11px; color: #6c7086; }
  &__timing-input {
    width: 88px; background: #313244; border: 1px solid #45475a; border-radius: 3px;
    color: #a6adc8; padding: 3px 5px; font-size: 11px; text-align: right;
    &:focus { outline: none; border-color: #89b4fa; }
  }

  &__footer {
    display: flex; justify-content: flex-end; gap: 8px;
    padding: 8px 14px; border-top: 1px solid #313244; flex-shrink: 0;
  }
}

.btn--try {
  background: #2a3a28; border-color: #a6e3a1; color: #a6e3a1;
  &:hover:not(:disabled) { background: #3a4a38; }
  &:disabled { opacity: .5; cursor: not-allowed; }
  &--done { background: #1e3a2a; border-color: #a6e3a1; color: #a6e3a1; }
}
</style>
