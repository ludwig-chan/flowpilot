<script setup lang="ts">
import { ref, computed } from 'vue'
import BaseInput from '@shared/components/BaseInput.vue'
import BaseSelect from '@shared/components/BaseSelect.vue'
import type { ConditionItem, ConditionLogic, ConditionOperator } from '@shared/types/flow'
import { CONDITION_OPERATORS } from '@shared/types/flow'
import { genId } from '@shared/utils/genId'
import type { VarInfo } from '@shared/utils/varAlias'

interface SelectOption {
  value: string | number
  label: string
  disabled?: boolean
}

// ── Props / Emits ────────────────────────────────────────────────────────────
const props = defineProps<{
  initialLabel?:       string
  initialValue?:       string               // 兼容旧格式
  initialConditions?:  ConditionItem[]
  initialLogic?:       ConditionLogic
  availableVars?:      VarInfo[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm', data: {
    label:      string
    conditions: ConditionItem[]
    logic:      ConditionLogic
  }): void
}>()

// ── 选项与转换 ────────────────────────────────────────────────────────────────
const operatorOptions: SelectOption[] = CONDITION_OPERATORS.map(op => ({
  value: op.value,
  label: op.label,
}))

const varOptions = computed<SelectOption[]>(() =>
  (props.availableVars ?? []).map(v => ({
    value: v.internal,
    label: v.alias,
  })),
)

function firstVar(): string {
  return props.availableVars?.[0]?.internal ?? ''
}

function defaultExprCondition(): ConditionItem {
  return {
    id: genId('cond'),
    mode: 'expr',
    leftVar: firstVar(),
    operator: '==',
    rightValue: '',
    value: firstVar() ? `{{${firstVar()}}} == ` : '',
  }
}

function buildExprValue(cond: ConditionItem): string {
  if (cond.mode !== 'expr' || !cond.leftVar || !cond.operator) return cond.value ?? ''
  return `{{${cond.leftVar}}} ${cond.operator} ${cond.rightValue?.trim() ?? ''}`
}

function parseLegacyExpr(expr?: string): Pick<ConditionItem, 'leftVar' | 'operator' | 'rightValue'> | null {
  if (!expr?.trim()) return null
  const match = expr.trim().match(/^(?:\{\{(\w+)\}\}|(.+?))\s*(>=|<=|!=|==|not_contains|contains|>|<)\s*(.*)$/)
  if (!match) return null

  const rawVar = match[1]?.trim()
  const aliasOrInternal = match[2]?.trim()
  const matchedVar = rawVar
    ? props.availableVars?.find(v => v.internal === rawVar)
    : props.availableVars?.find(v => v.alias === aliasOrInternal || v.internal === aliasOrInternal)

  if (!matchedVar) return null
  return {
    leftVar: matchedVar.internal,
    operator: match[3] as ConditionOperator,
    rightValue: match[4]?.trim() ?? '',
  }
}

function normalizeCondition(input: ConditionItem): ConditionItem {
  const cond: ConditionItem = JSON.parse(JSON.stringify(input))
  if (cond.mode === 'elem') return cond

  if (cond.leftVar && cond.operator && cond.rightValue !== undefined) {
    return { ...cond, value: buildExprValue(cond) }
  }

  const parsed = parseLegacyExpr(cond.value)
  if (parsed) return { ...cond, ...parsed, value: buildExprValue({ ...cond, ...parsed }) }

  // 无法解析的旧表达式保留 value，但让结构化控件处于未完成状态，提示用户重选。
  return {
    ...cond,
    leftVar: '',
    operator: undefined,
    rightValue: '',
  }
}

function isLegacyUnparsed(cond: ConditionItem): boolean {
  return cond.mode === 'expr' && !!cond.value?.trim() && (!cond.leftVar || !cond.operator)
}

function operatorLabel(op?: ConditionOperator): string {
  return CONDITION_OPERATORS.find(o => o.value === op)?.label ?? op ?? ''
}

// ── 步骤标签 ──────────────────────────────────────────────────────────────────
const label = ref(props.initialLabel ?? '条件判断')

// ── 多条件行 ──────────────────────────────────────────────────────────────────
function buildInitialConditions(): ConditionItem[] {
  if (props.initialConditions?.length) {
    return JSON.parse(JSON.stringify(props.initialConditions)).map((c: ConditionItem) => normalizeCondition(c))
  }
  if (props.initialValue?.trim()) {
    return [normalizeCondition({ id: genId('cond'), mode: 'expr', value: props.initialValue })]
  }
  return [defaultExprCondition()]
}

const conditions = ref<ConditionItem[]>(buildInitialConditions())
const logic = ref<ConditionLogic>(props.initialLogic ?? 'and')
const focusedIdx = ref(0)

// ── 行操作 ────────────────────────────────────────────────────────────────────
function addRow() {
  conditions.value.push(defaultExprCondition())
  focusedIdx.value = conditions.value.length - 1
}

function removeRow(idx: number) {
  if (conditions.value.length <= 1) return
  conditions.value.splice(idx, 1)
  if (focusedIdx.value >= conditions.value.length) focusedIdx.value = conditions.value.length - 1
}

function toggleLogic() {
  logic.value = logic.value === 'and' ? 'or' : 'and'
}

function setMode(cond: ConditionItem, mode: 'expr' | 'elem') {
  cond.mode = mode
  if (mode === 'expr') {
    cond.leftVar ||= firstVar()
    cond.operator ||= '=='
    cond.rightValue ??= ''
  }
}

// ── 验证 ──────────────────────────────────────────────────────────────────────
const canConfirm = computed(() =>
  conditions.value.every(c => {
    if (c.mode === 'elem') return !!c.selector?.trim()
    return !!c.leftVar && !!c.operator && !!c.rightValue?.trim()
  }),
)

// ── 确认 ──────────────────────────────────────────────────────────────────────
function confirm() {
  const trimLabel = label.value.trim() || '条件判断'
  const storedConditions = conditions.value.map(c => {
    if (c.mode === 'expr') {
      const rightValue = c.rightValue?.trim() ?? ''
      return {
        ...c,
        rightValue,
        value: buildExprValue({ ...c, rightValue }),
      }
    }
    return c
  })
  emit('confirm', {
    label:      trimLabel,
    conditions: storedConditions,
    logic:      logic.value,
  })
}
</script>

<template>
  <BaseModal title="🔀 条件判断" width="640px" :z-index="1050" @close="emit('close')">

    <!-- 步骤标签 -->
    <div class="cp-field">
      <label class="cp-field__label">步骤标签</label>
      <BaseInput v-model="label" placeholder="条件判断" style="width: 100%" />
    </div>

    <!-- 多条件行 -->
    <div class="cp-conditions">
      <div
        v-for="(cond, idx) in conditions"
        :key="cond.id"
        class="cp-cond-row"
        :class="{ 'cp-cond-row--focused': focusedIdx === idx }"
        @click="focusedIdx = idx"
      >
        <div class="cp-cond-row__header">
          <span class="cp-cond-row__index">条件 {{ idx + 1 }}</span>
          <BaseButton
            v-if="conditions.length > 1"
            class="cp-cond-row__remove"
            title="删除此条件"
            @click.stop="removeRow(idx)"
          >✖</BaseButton>
        </div>

        <!-- 模式切换 -->
        <div class="cp-cond-row__modes">
          <BaseButton
            size="sm"
            :class="{ 'cp-mode-btn--active': cond.mode === 'expr' }"
            @click.stop="setMode(cond, 'expr')"
          >变量条件</BaseButton>
          <BaseButton
            size="sm"
            :class="{ 'cp-mode-btn--active': cond.mode === 'elem' }"
            @click.stop="setMode(cond, 'elem')"
          >元素存在</BaseButton>
        </div>

        <!-- 结构化条件 -->
        <template v-if="cond.mode === 'expr'">
          <div v-if="!varOptions.length" class="cp-empty-vars">
            当前流程中没有可用变量。请先添加「获取文字」或「截图」步骤来创建变量。
          </div>
          <div v-else class="cp-structured">
            <BaseSelect
              v-model="cond.leftVar!"
              :options="varOptions"
              placeholder="选择变量"
            />
            <BaseSelect
              v-model="cond.operator!"
              :options="operatorOptions"
              placeholder="操作符"
            />
            <BaseInput
              v-model="cond.rightValue!"
              class="cp-structured__value"
              placeholder="比较值，如 50"
              @focus="focusedIdx = idx"
            />
          </div>
          <div v-if="isLegacyUnparsed(cond)" class="cp-legacy-warning">
            这个旧条件暂时无法自动转换，请重新选择变量、操作符和值后保存。
          </div>
          <div v-else-if="cond.leftVar && cond.operator" class="cp-preview">
            将判断：{{ props.availableVars?.find(v => v.internal === cond.leftVar)?.alias ?? cond.leftVar }}
            {{ operatorLabel(cond.operator) }}
            {{ cond.rightValue || '...' }}
          </div>
        </template>

        <!-- 元素选择器输入 -->
        <BaseInput
          v-else
          v-model="cond.selector!"
          placeholder="CSS 选择器，如 .item-price"
          style="width: 100%"
          @focus="focusedIdx = idx"
        />

        <!-- 行间 AND/OR 连接器 -->
        <div v-if="idx < conditions.length - 1" class="cp-logic-divider" @click.stop="toggleLogic">
          <span class="cp-logic-label">
            {{ logic === 'and' ? 'AND（且）' : 'OR（或）' }}
          </span>
        </div>
      </div>
    </div>

    <!-- 添加条件 -->
    <div class="cp-add-row">
      <BaseButton size="sm" @click="addRow">＋ 添加条件</BaseButton>
    </div>

    <!-- 底部按钮 -->
    <template #footer>
      <BaseButton @click="emit('close')">取消</BaseButton>
      <BaseButton kind="primary" :disabled="!canConfirm" @click="confirm">确认</BaseButton>
    </template>

  </BaseModal>
</template>

<style lang="scss" scoped>
.cp-field {
  padding: 10px 14px 0;
  display: flex; flex-direction: column; gap: 5px;
  &__label { font-size: 11px; font-weight: 600; color: $color-text-muted; text-transform: uppercase; letter-spacing: .04em; }
}

// ── 多条件行 ────────────────────────────────────────────────────────────────
.cp-conditions {
  padding: 8px 14px 0;
  display: flex; flex-direction: column;
}

.cp-cond-row {
  border: 1px solid $color-surface-1; border-radius: $radius-md;
  padding: 8px 10px; margin-bottom: 2px;
  cursor: pointer; transition: border-color .12s;
  &--focused { border-color: $color-blue; }
  &__header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 6px;
  }
  &__index {
    font-size: 11px; font-weight: 600; color: $color-text-muted;
  }
  &__remove {
    font-size: 11px; padding: 2px 6px;
  }
  &__modes {
    display: flex; gap: 4px; margin-bottom: 6px;
  }
}

.cp-mode-btn--active {
  background: $color-blue; color: #fff; border-color: $color-blue;
}

.cp-structured {
  display: grid;
  grid-template-columns: minmax(140px, 1.2fr) minmax(110px, 0.85fr) minmax(140px, 1fr);
  gap: 8px;
  align-items: center;

  &__value {
    width: 100%;
    min-width: 0;
  }
}

.cp-preview {
  margin-top: 6px;
  font-size: 11px;
  color: $color-text-secondary;
}

.cp-empty-vars,
.cp-legacy-warning {
  padding: 8px 10px;
  border-radius: $radius;
  font-size: 11px;
  line-height: 1.5;
}

.cp-empty-vars {
  color: $color-text-muted;
  background: $color-base;
  border: 1px solid $color-surface-1;
}

.cp-legacy-warning {
  margin-top: 6px;
  color: $color-yellow;
  background: rgba(249, 226, 175, 0.08);
  border: 1px solid rgba(249, 226, 175, 0.28);
}

.cp-logic-divider {
  display: flex; align-items: center; justify-content: center;
  padding: 4px 0; margin: 2px 0;
  cursor: pointer;
  &::before, &::after {
    content: ''; flex: 1; height: 1px;
    background: $color-surface-2;
  }
}

.cp-logic-label {
  font-size: 11px; font-weight: 700; color: $color-orange;
  padding: 0 10px; white-space: nowrap;
  transition: color .12s;
  &:hover { color: $color-red; }
}

.cp-add-row {
  padding: 4px 14px 0;
}
</style>
