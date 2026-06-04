<script setup lang="ts">
import { ref, computed } from 'vue'
import BaseInput from '@shared/components/BaseInput.vue'

// ── Props / Emits ────────────────────────────────────────────────────────────
const props = defineProps<{
  initialLabel?:  string
  initialValue?:  string
  availableVars?: string[]   // 当前流程中 get_text 步骤定义的变量名
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm', data: {
    label:  string
    mode:   'expr'
    value?: string
  }): void
}>()

// ── Local state ──────────────────────────────────────────────────────────────
const label       = ref(props.initialLabel ?? '条件判断')
const exprValue   = ref(props.initialValue ?? '')
const exprInputEl = ref<HTMLInputElement | null>(null)

// 点击变量标签，在光标位置插入 {{varName}}
function insertVar(varName: string) {
  const el = exprInputEl.value
  const token = `{{${varName}}}`
  if (!el) {
    exprValue.value += (exprValue.value ? ' ' : '') + token
    return
  }
  const start = el.selectionStart ?? exprValue.value.length
  const end   = el.selectionEnd   ?? exprValue.value.length
  exprValue.value = exprValue.value.slice(0, start) + token + exprValue.value.slice(end)
  // 自动踩点移到插入内容之后
  const pos = start + token.length
  el.focus()
  el.setSelectionRange(pos, pos)
}

// 点击运算符，在光标位置插入（两侧带空格）
function insertOp(op: string) {
  const el = exprInputEl.value
  const token = ` ${op} `
  if (!el) {
    exprValue.value += token
    return
  }
  const start = el.selectionStart ?? exprValue.value.length
  const end   = el.selectionEnd   ?? exprValue.value.length
  exprValue.value = exprValue.value.slice(0, start) + token + exprValue.value.slice(end)
  const pos = start + token.length
  el.focus()
  el.setSelectionRange(pos, pos)
}

// ── Validation & confirm ─────────────────────────────────────────────────────
const canConfirm = computed(() => exprValue.value.trim().length > 0)

function confirm() {
  const trimLabel = label.value.trim() || '条件判断'
  emit('confirm', { label: trimLabel, mode: 'expr', value: exprValue.value.trim() })
}
</script>

<template>
  <!-- ── 主弹窗 ── -->
  <BaseModal title="🔀 条件判断" width="500px" :z-index="1050" @close="emit('close')">

      <!-- 标签 -->
      <div class="cp-field">
        <label class="cp-field__label">步骤标签</label>
        <BaseInput
          v-model="label"
          placeholder="条件判断"
          style="width: 100%"
        />
      </div>

      <!-- 表达式 -->
      <div class="cp-field">
        <label class="cp-field__label">表达式</label>
        <BaseInput
          ref="exprInputEl"
          v-model="exprValue"
          placeholder="例：{{price}} > 100"
          style="width: 100%"
        />
      </div>
      <!-- 可选变量列表 -->
      <div v-if="props.availableVars?.length" class="cp-vars">
        <span class="cp-vars__label">可用变量：</span>
        <BaseButton
          v-for="v in props.availableVars"
          :key="v"
          class="cp-var-chip"
          @click="insertVar(v)"
        >&#123;&#123;{{ v }}&#125;&#125;</BaseButton>
      </div>
      <div class="cp-hints">
        <div class="cp-hints__title">支持的运算符（点击插入）</div>
        <div class="cp-op-chips">
          <BaseButton class="cp-op-chip" title="大于" @click="insertOp('>')"><code>&gt;</code><span>大于</span></BaseButton>
          <BaseButton class="cp-op-chip" title="小于" @click="insertOp('<')"><code>&lt;</code><span>小于</span></BaseButton>
          <BaseButton class="cp-op-chip" title="大于等于" @click="insertOp('>=')"><code>&gt;=</code><span>大于等于</span></BaseButton>
          <BaseButton class="cp-op-chip" title="小于等于" @click="insertOp('<=')"><code>&lt;=</code><span>小于等于</span></BaseButton>
          <BaseButton class="cp-op-chip" title="等于" @click="insertOp('==')"><code>==</code><span>等于</span></BaseButton>
          <BaseButton class="cp-op-chip" title="不等于" @click="insertOp('!=')"><code>!=</code><span>不等于</span></BaseButton>
          <BaseButton class="cp-op-chip" title="包含文字" @click="insertOp('contains')"><code>contains</code><span>包含</span></BaseButton>
          <BaseButton class="cp-op-chip" title="不包含文字" @click="insertOp('not_contains')"><code>not_contains</code><span>不包含</span></BaseButton>
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
        <BaseButton variant="primary" :disabled="!canConfirm" @click="confirm">确认</BaseButton>
      </template>

  </BaseModal>
</template>

<style lang="scss" scoped>
.cp-field {
  padding: 10px 14px 0;
  display: flex; flex-direction: column; gap: 5px;
  &__label { font-size: 11px; font-weight: 600; color: $color-text-muted; text-transform: uppercase; letter-spacing: .04em; }
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
