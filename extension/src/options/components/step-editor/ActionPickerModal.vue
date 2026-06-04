<script setup lang="ts">
import { ref, computed } from 'vue'
import type { SerializedElement } from '@shared/types/dom'
import type { FlowStep, ActionType } from '@shared/types/flow'
import BaseInput from '@shared/components/BaseInput.vue'
import RangeInput from '@shared/components/RangeInput.vue'

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
const stepFoundDelay    = ref<[number | undefined, number | undefined]>([props.initialFoundDelay?.[0], props.initialFoundDelay?.[1]])
const showAdvanced      = ref(!!(props.initialWaitTimeout || props.initialFoundDelay))

const currentOpt = computed(() => ACTION_OPTIONS.find(o => o.type === selectedType.value)!)

const displaySel = computed(() => props.overrideSel ?? props.element.selector.cssSelector)
const autoLabel  = computed(() => {
  const action = currentOpt.value.label.replace(/^\S+\s*/, '')
  const quoted = props.element.label.match(/"(.+)"/)
  const base = (
    quoted?.[1] ||
    props.element.selector.ariaLabel ||
    props.element.selector.text ||
    ''
  ).slice(0, 36)
  return base ? `${action}：${base}` : action
})

function buildStep(): FlowStep {
  const sel   = props.overrideSel
    ? { ...props.element.selector, cssSelector: props.overrideSel }
    : props.element.selector
  const [fdMin, fdMax] = stepFoundDelay.value
  return {
    id:               `step_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    type:             selectedType.value,
    label:            stepLabel.value.trim() || autoLabel.value,
    selector:         sel,
    value:            inputValue.value.trim() || undefined,
    relativeSelector: props.isRelative || undefined,
    waitTimeout:      stepWaitTimeout.value || undefined,
    foundDelay:       ((fdMin ?? 0) > 0 || (fdMax ?? 0) > 0) ? [fdMin ?? 0, fdMax ?? 0] : undefined,
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
  <BaseModal title="选择动作" :z-index="1100" @close="emit('cancel')">

      <div class="action-modal__sel">
        <span class="action-modal__sel-label">选中元素：</span>
        <code class="action-modal__sel-code" :title="displaySel">{{ displaySel }}</code>
        <span v-if="isRelative" class="action-modal__rel-badge">相对路径</span>
        <BaseButton
          variant="ghost"
          class="action-modal__repick-btn"
          title="重新选择元素"
          @click="emit('re-pick', selectedType, inputValue.trim() || undefined)"
        >🎯 换元素</BaseButton>      </div>

      <div class="action-modal__body">
        <div class="action-modal__name-row">
          <span class="action-modal__name-label">步骤名称</span>
          <BaseInput
            class="action-modal__name-input"
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
          <BaseInput
            v-model="inputValue"
            :placeholder="currentOpt.valuePlaceholder"
          />
        </div>
        <div class="action-modal__adv">
          <button type="button" class="action-modal__adv-toggle" @click="showAdvanced = !showAdvanced">
            <span class="action-modal__adv-arrow">{{ showAdvanced ? '▼' : '▶' }}</span>
            高级设置
          </button>
          <div v-show="showAdvanced" class="action-modal__adv-body">
            <div class="action-modal__adv-row">
              <span class="action-modal__adv-label">超时</span>
              <input
                type="number" min="0" step="1000"
                class="action-modal__adv-input"
                placeholder="使用流程默认"
                :value="stepWaitTimeout ?? ''"
                @change="stepWaitTimeout = Number(($event.target as HTMLInputElement).value) || undefined"
              />
              <span class="action-modal__adv-unit">ms</span>
              <span class="action-modal__adv-hint">超过此时间未找到元素则报错</span>
            </div>
            <div class="action-modal__adv-row">
              <span class="action-modal__adv-label">出现后延迟</span>
              <RangeInput
                v-model="stepFoundDelay"
                :allow-empty="true"
                placeholder-min="最小"
                placeholder-max="最大"
              />
              <span class="action-modal__adv-hint">找到元素后随机等待，模拟人工操作</span>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <BaseButton @click="emit('cancel')">取消</BaseButton>
          <BaseButton
          :class="['btn--try', { 'btn--try--done': tryState === 'done' }]"
          :disabled="tryState === 'running'"
          @click="tryAction"
        >
          {{ tryState === 'running' ? '⏳ 执行中…' : tryState === 'done' ? '✓ 已执行' : '▷ 试一下' }}
        </BaseButton>
        <BaseButton variant="primary" @click="confirm">确定</BaseButton>
      </template>

  </BaseModal>
</template>

<style lang="scss" scoped>
.action-modal {
  &__sel {
    display: flex; align-items: center; gap: 6px;
    padding: 7px 14px; background: $color-base; border-bottom: 1px solid $color-surface-1; flex-shrink: 0;
  }
  &__sel-label { font-size: 11px; color: $color-text-muted; flex-shrink: 0; }
  &__sel-code {
    font-family: 'Cascadia Code', monospace; font-size: 11px; color: $color-teal;
    overflow-x: auto; white-space: nowrap; flex: 1; min-width: 0;
    scrollbar-width: thin; scrollbar-color: $color-surface-2 transparent;
  }
  &__rel-badge {
    font-size: 10px; background: $color-focus-bg; color: $color-blue;
    padding: 1px 6px; border-radius: 99px; flex-shrink: 0;
  }

  &__repick-btn { font-size: 11px; padding: 2px 8px; flex-shrink: 0; }

  &__body {
    padding: 12px 14px; display: flex; flex-direction: column; gap: 10px;
  }
  &__name-row   { display: flex; align-items: center; gap: 8px; }
  &__name-label { font-size: 11px; color: $color-text-muted; flex-shrink: 0; width: 52px; }
  &__name-input { flex: 1; }
  &__action-row { display: flex; align-items: center; gap: 8px; }
  &__action-label { font-size: 11px; color: $color-text-muted; flex-shrink: 0; width: 52px; }
  &__action-select {
    flex: 1; background: $color-surface-1; border: 1px solid $color-surface-2; border-radius: $radius;
    color: $color-text; padding: 5px 8px; font-size: 12px; cursor: pointer;
    &:focus { outline: none; border-color: $color-blue; }
  }
  &__value-row { display: flex; align-items: center; gap: 8px; }
  &__value-label { font-size: 11px; color: $color-text-muted; flex-shrink: 0; width: 52px; }

  &__adv {
    padding-top: 8px; border-top: 1px solid $color-surface-1;
  }
  &__adv-toggle {
    display: flex; align-items: center; gap: 5px;
    background: none; border: none; padding: 0; cursor: pointer;
    font-size: 11px; color: $color-text-muted;
    &:hover { color: $color-text; }
  }
  &__adv-arrow { font-size: 9px; }
  &__adv-body {
    display: flex; flex-direction: column; gap: 7px; padding-top: 8px;
  }
  &__adv-row {
    display: flex; align-items: center; flex-wrap: wrap; gap: 5px;
  }
  &__adv-label { font-size: 11px; color: $color-text-muted; flex-shrink: 0; width: 66px; }
  &__adv-input {
    width: 80px; background: $color-surface-1; border: 1px solid $color-surface-2; border-radius: $radius-sm;
    color: $color-text-secondary; padding: 3px 5px; font-size: 11px; text-align: right;
    &:focus { outline: none; border-color: $color-blue; }
  }
  &__adv-unit   { font-size: 11px; color: $color-text-muted; flex-shrink: 0; }
  &__adv-hint   { font-size: 10px; color: $color-text-muted; font-style: italic; flex-shrink: 0; }
}

.btn--try {
  background: #2a3a28; border-color: $color-green; color: $color-green;
  &:hover:not(:disabled) { background: #3a4a38; }
  &:disabled { opacity: .5; cursor: not-allowed; }
  &--done { background: #1e3a2a; border-color: $color-green; color: $color-green; }
}
</style>
