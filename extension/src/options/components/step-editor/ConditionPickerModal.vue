<script setup lang="ts">
import { ref, computed } from 'vue'
import BaseInput from '@shared/components/BaseInput.vue'
import type { ConditionItem, ConditionLogic } from '@shared/types/flow'
import { genId } from '@shared/utils/genId'
import { buildVarAliasMap, displayExprWithAliases, storeExprFromDisplay, type VarInfo } from '@shared/utils/varAlias'

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

// ── 变量别名映射 ──────────────────────────────────────────────────────────────
const varAliasMap = computed(() => buildVarAliasMap(props.availableVars ?? []))

// ── 步骤标签 ──────────────────────────────────────────────────────────────────
const label = ref(props.initialLabel ?? '条件判断')

// ── 多条件行 ──────────────────────────────────────────────────────────────────
function buildInitialConditions(): ConditionItem[] {
  if (props.initialConditions?.length) {
    // 将内部名 {{var0}} 转换为别名显示
    return JSON.parse(JSON.stringify(props.initialConditions)).map((c: ConditionItem) => {
      if (c.mode === 'expr' && c.value) {
        c.value = displayExprWithAliases(c.value, varAliasMap.value)
      }
      return c
    })
  }
  // 兼容旧格式：从 initialValue 构造单行（也转换为别名显示）
  if (props.initialValue?.trim()) {
    return [{ id: genId('cond'), mode: 'expr', value: displayExprWithAliases(props.initialValue, varAliasMap.value) }]
  }
  return [{ id: genId('cond'), mode: 'expr', value: '' }]
}

const conditions = ref<ConditionItem[]>(buildInitialConditions())
const logic = ref<ConditionLogic>(props.initialLogic ?? 'and')
const focusedIdx = ref(0)

// 当前聚焦的条件行
const focusedCond = computed(() => conditions.value[focusedIdx.value])

// ── 行操作 ────────────────────────────────────────────────────────────────────
function addRow() {
  conditions.value.push({ id: genId('cond'), mode: 'expr', value: '' })
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

// ── 插入操作（作用于当前聚焦行）───────────────────────────────────────────────
function insertVar(varInfo: VarInfo) {
  const cond = focusedCond.value
  if (!cond || cond.mode !== 'expr') return
  // 在显示层插入别名文本（用户看到的是别名）
  const alias = varInfo.alias
  cond.value = (cond.value ?? '') + ((cond.value?.trim() ? ' ' : '') + alias)
}

function insertOp(op: string) {
  const cond = focusedCond.value
  if (!cond || cond.mode !== 'expr') return
  cond.value = (cond.value ?? '') + ` ${op} `
}

// ── 验证 ──────────────────────────────────────────────────────────────────────
const canConfirm = computed(() =>
  conditions.value.every(c =>
    c.mode === 'elem' ? !!c.selector?.trim() : !!c.value?.trim()
  )
)

// ── 确认 ──────────────────────────────────────────────────────────────────────
function confirm() {
  const trimLabel = label.value.trim() || '条件判断'
  // 将显示层的别名还原为内部存储格式 {{var0}}
  const storedConditions = conditions.value.map(c => {
    if (c.mode === 'expr' && c.value) {
      return { ...c, value: storeExprFromDisplay(c.value, varAliasMap.value) }
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
  <BaseModal title="🔀 条件判断" width="560px" :z-index="1050" @close="emit('close')">

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
            @click.stop="cond.mode = 'expr'"
          >表达式</BaseButton>
          <BaseButton
            size="sm"
            :class="{ 'cp-mode-btn--active': cond.mode === 'elem' }"
            @click.stop="cond.mode = 'elem'"
          >元素存在</BaseButton>
        </div>

        <!-- 表达式输入 -->
        <BaseInput
          v-if="cond.mode === 'expr'"
          v-model="cond.value!"
          placeholder="例：{{price}} > 100"
          style="width: 100%"
          @focus="focusedIdx = idx"
        />
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

    <!-- 可用变量（作用于当前聚焦的表达式行） -->
    <div v-if="props.availableVars?.length" class="cp-vars">
      <span class="cp-vars__label">可用变量：</span>
      <BaseButton
        v-for="v in props.availableVars"
        :key="v.internal"
        class="cp-var-chip"
        :disabled="!focusedCond || focusedCond.mode !== 'expr'"
        @click="insertVar(v)"
      >{{ v.alias }}</BaseButton>
    </div>

    <!-- 运算符提示 -->
    <div class="cp-hints">
      <div class="cp-hints__title">运算符（点击插入到当前条件{{ focusedIdx + 1 }}）</div>
      <div class="cp-op-chips">
        <BaseButton class="cp-op-chip" title="大于"          :disabled="!focusedCond || focusedCond.mode !== 'expr'" @click="insertOp('>')"><code>&gt;</code><span>大于</span></BaseButton>
        <BaseButton class="cp-op-chip" title="小于"          :disabled="!focusedCond || focusedCond.mode !== 'expr'" @click="insertOp('<')"><code>&lt;</code><span>小于</span></BaseButton>
        <BaseButton class="cp-op-chip" title="大于等于"      :disabled="!focusedCond || focusedCond.mode !== 'expr'" @click="insertOp('>=')"><code>&gt;=</code><span>大于等于</span></BaseButton>
        <BaseButton class="cp-op-chip" title="小于等于"      :disabled="!focusedCond || focusedCond.mode !== 'expr'" @click="insertOp('<=')"><code>&lt;=</code><span>小于等于</span></BaseButton>
        <BaseButton class="cp-op-chip" title="等于"          :disabled="!focusedCond || focusedCond.mode !== 'expr'" @click="insertOp('==')"><code>==</code><span>等于</span></BaseButton>
        <BaseButton class="cp-op-chip" title="不等于"        :disabled="!focusedCond || focusedCond.mode !== 'expr'" @click="insertOp('!=')"><code>!=</code><span>不等于</span></BaseButton>
        <BaseButton class="cp-op-chip" title="包含文字"      :disabled="!focusedCond || focusedCond.mode !== 'expr'" @click="insertOp('contains')"><code>contains</code><span>包含</span></BaseButton>
        <BaseButton class="cp-op-chip" title="不包含文字"    :disabled="!focusedCond || focusedCond.mode !== 'expr'" @click="insertOp('not_contains')"><code>not_contains</code><span>不包含</span></BaseButton>
      </div>
      <div class="cp-hints__example">
        示例：<code>{{text}} contains 优惠</code>、<code>{{count}} >= 3</code>
      </div>
      <div v-if="!props.availableVars?.length" class="cp-hints__note">
        💡 用 <code>获取文字</code> 步骤先将页面内容存入变量，再在此处引用
      </div>
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

.cp-hints {
  margin: 8px 14px 0; padding: 10px 12px;
  background: $color-base; border: 1px solid $color-surface-1; border-radius: $radius-md;

  &__title { font-size: 11px; font-weight: 600; color: $color-text-muted; margin-bottom: 8px; }
  &__example {
    font-size: 11px; color: $color-text-secondary; margin-bottom: 6px;
    code { font-family: 'Cascadia Code', monospace; color: $color-mauve; }
  }
  &__note {
    font-size: 11px; color: $color-text-muted; line-height: 1.5;
    code { font-family: 'Cascadia Code', monospace; color: $color-yellow; }
    strong { color: $color-green; }
  }
}

.cp-op-chips {
  display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 8px;
}
.cp-op-chip {
  display: flex; flex-direction: column; align-items: center;
  padding: 3px 8px; border: 1px solid $color-surface-2; border-radius: $radius;
  background: $color-base; cursor: pointer; transition: all .12s;
  &:hover { background: $color-surface-1; border-color: $color-blue; }
  code { font-family: 'Cascadia Code', monospace; font-size: 11px; color: $color-blue; line-height: 1.4; }
  span { font-size: 9px; color: $color-text-muted; margin-top: 1px; }
}

.cp-vars {
  display: flex; flex-wrap: wrap; align-items: center; gap: 5px;
  padding: 6px 14px 0;
  &__label { font-size: 11px; color: $color-text-muted; white-space: nowrap; }
}

.cp-var-chip {
  padding: 2px 8px; border: 1px solid $color-surface-2; border-radius: $radius;
  background: $color-base; color: $color-mauve;
  font-family: 'Cascadia Code', monospace; font-size: 11px;
  cursor: pointer; transition: all .12s;
  &:hover { background: $color-surface-1; border-color: $color-mauve; color: #f5c2e7; }
}
</style>
