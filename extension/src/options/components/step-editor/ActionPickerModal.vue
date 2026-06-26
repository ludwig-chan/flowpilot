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
  valueLabel?:       string
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
      { type: 'get_text',       label: '📋 获取文字', needValue: true,  valueLabel: '变量别名', valuePlaceholder: '如 年龄、学历、姓名' },
      { type: 'save_data',      label: '💾 保存数据', needValue: false },
      { type: 'wait_appear',    label: '⏳ 等待出现', needValue: false },
      { type: 'wait_disappear', label: '🕐 等待消失', needValue: false },
    ],
  },
  {
    label: '页面',
    options: [
      { type: 'scroll_to',          label: '📜 滚动到',    needValue: false },
      { type: 'save_canvas',        label: '📷 截图',      needValue: true, valueLabel: '变量别名', valuePlaceholder: '如 截图、卡片图片' },
    ],
  },
]

const ACTION_OPTIONS = ACTION_GROUPS.flatMap(g => g.options)

const props = defineProps<{
  element:             SerializedElement
  initialType?:        ActionType
  initialValue?:       string
  initialVarAlias?:    string
  initialLabel?:       string
  initialWaitTimeout?: number
  initialFoundDelay?:  [number, number]
  initialCaptureDownload?: boolean
  initialDownloadVarName?: string
  initialDownloadWaitTimeout?: number
  existingSteps?:      FlowStep[]
}>()

const emit = defineEmits<{
  (e: 'confirm', step: FlowStep): void
  (e: 'try',     step: FlowStep): void
  (e: 'cancel'): void
  (e: 're-pick', type: ActionType, value: string | undefined, varAlias: string | undefined, captureDownload?: boolean, downloadVarName?: string, downloadWaitTimeout?: number): void
}>()

function inferDefault(el: SerializedElement): ActionType {
  if (el.kind === 'input')  return 'input'
  if (el.kind === 'select') return 'select'
  return 'click'
}

import { nextVarIndex, genVarName, genDefaultAlias } from '@shared/utils/varAlias'

const selectedType      = ref<ActionType>(props.initialType ?? inferDefault(props.element))
const inputValue        = ref(props.initialValue ?? '')
const inputVarAlias     = ref(props.initialVarAlias ?? '')
const stepLabel         = ref(props.initialLabel ?? '')
const tryState          = ref<'idle' | 'running' | 'done'>('idle')
const stepWaitTimeout   = ref<number | undefined>(props.initialWaitTimeout)
const stepFoundDelay    = ref<[number | undefined, number | undefined]>([props.initialFoundDelay?.[0], props.initialFoundDelay?.[1]])
const captureDownload   = ref(!!props.initialCaptureDownload)
const downloadVarName   = ref(props.initialDownloadVarName ?? '')
const downloadWaitTimeout = ref<number | undefined>(props.initialDownloadWaitTimeout ?? 30_000)
const showAdvanced      = ref(!!(props.initialWaitTimeout || props.initialFoundDelay))

const currentOpt = computed(() => ACTION_OPTIONS.find(o => o.type === selectedType.value)!)
const canCaptureDownload = computed(() => selectedType.value === 'click')

const displaySel = computed(() => props.element.selector.cssSelector)
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
  const [fdMin, fdMax] = stepFoundDelay.value
  const isVarStep = selectedType.value === 'get_text' || selectedType.value === 'save_canvas'

  // 对 get_text / save_canvas：用户填的是别名，内部名自动生成
  let finalValue: string | undefined
  let finalVarAlias: string | undefined
  if (isVarStep) {
    // 编辑已有步骤时保留原内部名，新建时自动生成
    if (props.initialValue?.trim()) {
      finalValue = props.initialValue.trim()
    } else {
      const idx = nextVarIndex(props.existingSteps ?? [])
      finalValue = genVarName(idx)                           // var0, var1...
    }
    finalVarAlias = inputVarAlias.value.trim() || genDefaultAlias(
      // 从 value 中提取编号用于默认别名
      finalValue.match(/^var(\d+)$/) ? parseInt(finalValue.match(/^var(\d+)$/)![1]) : nextVarIndex(props.existingSteps ?? [])
    ) // 用户填的或 "变量1"
  } else {
    finalValue = inputValue.value.trim() || undefined
  }

  const shouldCaptureDownload = selectedType.value === 'click' && captureDownload.value

  return {
    id:               `step_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    type:             selectedType.value,
    label:            stepLabel.value.trim() || autoLabel.value,
    selector:         props.element.selector,
    value:            finalValue,
    varAlias:         finalVarAlias,
    waitTimeout:      stepWaitTimeout.value || undefined,
    foundDelay:       ((fdMin ?? 0) > 0 || (fdMax ?? 0) > 0) ? [fdMin ?? 0, fdMax ?? 0] : undefined,
    captureDownload:  shouldCaptureDownload || undefined,
    downloadVarName:  shouldCaptureDownload ? downloadVarName.value.trim() || undefined : undefined,
    downloadWaitTimeout: shouldCaptureDownload ? downloadWaitTimeout.value || undefined : undefined,
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
        <BaseButton
          class="action-modal__repick-btn"
          title="重新选择元素"
          @click="emit('re-pick', selectedType, inputValue.trim() || undefined, inputVarAlias.trim() || undefined, captureDownload, downloadVarName.trim() || undefined, downloadWaitTimeout)"
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
            @change="selectedType = ($event.target as HTMLSelectElement).value as ActionType; inputValue = ''; inputVarAlias = ''; if (selectedType !== 'click') captureDownload = false"
          >
            <optgroup v-for="group in ACTION_GROUPS" :key="group.label" :label="group.label">
              <option v-for="opt in group.options" :key="opt.type" :value="opt.type">{{ opt.label }}</option>
            </optgroup>
          </select>
        </div>
        <div v-if="currentOpt.needValue" class="action-modal__value-row">
          <span class="action-modal__value-label">{{ currentOpt.valueLabel || '值' }}</span>
          <BaseInput
            v-if="selectedType === 'get_text' || selectedType === 'save_canvas'"
            v-model="inputVarAlias"
            :placeholder="currentOpt.valuePlaceholder"
          />
          <BaseInput
            v-else
            v-model="inputValue"
            :placeholder="currentOpt.valuePlaceholder"
          />
        </div>
        <div v-if="canCaptureDownload" class="action-modal__download">
          <label class="action-modal__download-toggle">
            <input v-model="captureDownload" type="checkbox" />
            <span>此点击会触发下载</span>
          </label>
          <div v-if="captureDownload" class="action-modal__download-body">
            <div class="action-modal__value-row">
              <span class="action-modal__value-label">下载变量</span>
              <BaseInput v-model="downloadVarName" placeholder="如 发票附件、invoiceFile" />
            </div>
            <div class="action-modal__adv-row">
              <span class="action-modal__adv-label">下载超时</span>
              <BaseNumberInput
                min="1000" step="1000"
                style="width: 120px"
                :modelValue="downloadWaitTimeout"
                @update:modelValue="downloadWaitTimeout = $event || undefined"
              />
              <span class="action-modal__adv-unit">ms</span>
              <span class="action-modal__adv-hint">后续执行时等待下载完成，第一轮仅保存配置</span>
            </div>
          </div>
        </div>
        <div class="action-modal__adv">
          <BaseButton type="button" class="action-modal__adv-toggle" @click="showAdvanced = !showAdvanced">
            <span class="action-modal__adv-arrow">{{ showAdvanced ? '▼' : '▶' }}</span>
            高级设置
          </BaseButton>
          <div v-show="showAdvanced" class="action-modal__adv-body">
            <div class="action-modal__adv-row">
              <span class="action-modal__adv-label">超时</span>
              <BaseNumberInput
                min="0" step="1000"
                placeholder="使用流程默认"
                style="width: 120px"
                :modelValue="stepWaitTimeout"
                @update:modelValue="stepWaitTimeout = $event || undefined"
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
        <BaseButton kind="primary" @click="confirm">确定</BaseButton>
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

  &__download {
    padding: 8px 10px;
    border: 1px solid $color-surface-1;
    border-radius: $radius;
    background: rgba(137, 180, 250, 0.06);
  }
  &__download-toggle {
    display: flex; align-items: center; gap: 7px;
    font-size: 12px; color: $color-text; cursor: pointer;
  }
  &__download-body {
    display: flex; flex-direction: column; gap: 7px;
    padding-top: 8px; margin-top: 8px;
    border-top: 1px solid $color-surface-1;
  }

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
