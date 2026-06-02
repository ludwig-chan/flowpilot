<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import ElementPickerDrawer from '../element-picker/ElementPickerDrawer.vue'
import type { SerializedDomNode } from '@shared/types/dom'
import BaseModal from '@shared/components/BaseModal.vue'
import BaseButton from '@shared/components/BaseButton.vue'
import BaseInput from '@shared/components/BaseInput.vue'

// ── Props / Emits ────────────────────────────────────────────────────────────
const props = defineProps<{
  initialLabel?:     string
  initialMode?:      'expr' | 'elem'
  initialValue?:     string
  initialSelector?:  string
  availableVars?:    string[]   // 当前流程中 get_text 步骤定义的变量名
  domTree:           SerializedDomNode[]
  domFilter:         string
  domScanning:       boolean
  domMutated:        boolean
  domTabTitle:       string
  pickMode:          boolean
  pickedCssSelector: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm', data: {
    label:     string
    mode:      'expr' | 'elem'
    value?:    string
    selector?: string
  }): void
  (e: 'scan'):                               void
  (e: 'toggle-pick'):                        void
  (e: 'update:domFilter', v: string):        void
  (e: 'hover', css: string):                 void
  (e: 'test-action', css: string, actionType: string, value?: string): void
}>()

// ── Local state ──────────────────────────────────────────────────────────────
const label        = ref(props.initialLabel ?? '条件判断')
const mode         = ref<'expr' | 'elem'>(props.initialMode ?? 'expr')
const exprValue    = ref(props.initialValue ?? '')
const elemSelector = ref(props.initialSelector ?? '')
const showPicker   = ref(false)
const exprInputEl  = ref<HTMLInputElement | null>(null)

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

// ── Node → CSS helper ────────────────────────────────────────────────────────
function nodeCss(node: SerializedDomNode): string {
  if (node.item?.selector.cssSelector) return node.item.selector.cssSelector
  let sel = node.tag
  if (node.id) sel += `#${node.id}`
  else if (node.classes) {
    const first = node.classes.trim().split(/\s+/)[0]
    if (first) sel += `.${first}`
  }
  return sel
}

// ── Picker interactions ──────────────────────────────────────────────────────
function openElemPicker() {
  showPicker.value = true
  emit('scan')
}

function onNodeSelected(node: SerializedDomNode) {
  elemSelector.value = nodeCss(node)
  showPicker.value   = false
}

// When "pick from page" yields a result, capture it
watch(() => props.pickedCssSelector, (css) => {
  if (!css || !showPicker.value) return
  elemSelector.value = css
  showPicker.value   = false
})

// ── Validation & confirm ─────────────────────────────────────────────────────
const canConfirm = computed(() =>
  mode.value === 'expr'
    ? exprValue.value.trim().length > 0
    : elemSelector.value.trim().length > 0
)

function confirm() {
  const trimLabel = label.value.trim() || '条件判断'
  if (mode.value === 'expr') {
    emit('confirm', { label: trimLabel, mode: 'expr', value: exprValue.value.trim() })
  } else {
    emit('confirm', { label: trimLabel, mode: 'elem', selector: elemSelector.value.trim() })
  }
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

      <!-- 模式切换 -->
      <div class="cp-field">
        <label class="cp-field__label">条件类型</label>
        <div class="cp-mode-tabs">
          <button
            :class="['cp-mode-tab', { 'cp-mode-tab--active': mode === 'expr' }]"
            @click="mode = 'expr'"
          >📝 表达式</button>
          <button
            :class="['cp-mode-tab', { 'cp-mode-tab--active': mode === 'elem' }]"
            @click="mode = 'elem'"
          >🔍 元素存在</button>
        </div>
      </div>

      <!-- 表达式模式 -->
      <template v-if="mode === 'expr'">
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
          <button
            v-for="v in props.availableVars"
            :key="v"
            class="cp-var-chip"
            v-text="'{{' + v + '}}'"
          @click="insertVar(v)"
          ></button>
        </div>
        <div class="cp-hints">
          <div class="cp-hints__title">支持的运算符</div>
          <div class="cp-hints__grid">
            <code>&gt;</code><span>大于</span>
            <code>&lt;</code><span>小于</span>
            <code>&gt;=</code><span>大于等于</span>
            <code>&lt;=</code><span>小于等于</span>
            <code>==</code><span>等于</span>
            <code>!=</code><span>不等于</span>
            <code>contains</code><span>包含文字</span>
            <code>not_contains</code><span>不包含文字</span>
          </div>
          <div class="cp-hints__example">
            示例：<code>{{text}} contains 优惠</code>、<code>{{count}} >= 3</code>
          </div>
          <div v-if="!props.availableVars?.length" class="cp-hints__note">
            💡 用 <code>获取文字</code> 步骤先将页面内容存入变量，再在此处引用
          </div>
        </div>
      </template>

      <!-- 元素存在模式 -->
      <template v-else>
        <div class="cp-field">
          <label class="cp-field__label">目标元素</label>
          <div class="cp-elem-row">
            <template v-if="elemSelector">
              <code class="cp-elem-sel" :title="elemSelector">{{ elemSelector }}</code>
              <BaseButton variant="ghost" size="sm" class="cp-elem-clear" @click="elemSelector = ''">✕</BaseButton>
              <BaseButton size="sm" @click="openElemPicker">重选</BaseButton>
            </template>
            <BaseButton v-else size="sm" variant="primary" @click="openElemPicker">
              选择元素…
            </BaseButton>
          </div>
        </div>
        <div class="cp-hints">
          <div class="cp-hints__note">
            🔍 运行时若该元素<strong>存在于页面</strong>则条件成立，否则执行 ELSE 分支
          </div>
        </div>
      </template>

      <!-- 底部按钮 -->
      <template #footer>
        <BaseButton @click="emit('close')">取消</BaseButton>
        <BaseButton variant="primary" :disabled="!canConfirm" @click="confirm">确认</BaseButton>
      </template>

  </BaseModal>

  <!-- ── 元素选择抽屉 ── -->
  <ElementPickerDrawer
    v-if="showPicker"
    title="🔍 选择：条件判断目标元素"
    :dom-tree="domTree"
    :dom-filter="domFilter"
    :dom-scanning="domScanning"
    :dom-mutated="domMutated"
    :dom-tab-title="domTabTitle"
    :pick-mode="pickMode"
    :picked-css-selector="pickedCssSelector"
    :select-any="true"
    :highlight-selector="elemSelector"
    @close="showPicker = false"
    @scan="emit('scan')"
    @toggle-pick="emit('toggle-pick')"
    @select="onNodeSelected"
    @hover="emit('hover', $event)"
    @test-action="(css: string, type: string, val?: string) => emit('test-action', css, type, val)"
    @update:dom-filter="emit('update:domFilter', $event)"
  >
    <template #toolbar-status>
      <span class="cp-picking">● 正在选择条件目标元素</span>
    </template>
  </ElementPickerDrawer>
</template>

<style lang="scss" scoped>
.cp-field {
  padding: 10px 14px 0;
  display: flex; flex-direction: column; gap: 5px;
  &__label { font-size: 11px; font-weight: 600; color: $color-text-muted; text-transform: uppercase; letter-spacing: .04em; }
}

.cp-mode-tabs {
  display: flex; gap: 4px;
}

.cp-mode-tab {
  flex: 1; padding: 6px 10px; border: 1px solid $color-surface-2; border-radius: 5px;
  background: $color-base; color: $color-text-secondary; cursor: pointer; font-size: 12px;
  transition: all .15s;
  &:hover { background: $color-surface-1; color: $color-text; }
  &--active { background: $color-focus-bg; border-color: $color-blue; color: $color-blue; font-weight: 600; }
}

.cp-hints {
  margin: 8px 14px 0; padding: 10px 12px;
  background: $color-base; border: 1px solid $color-surface-1; border-radius: $radius-md;

  &__title { font-size: 11px; font-weight: 600; color: $color-text-muted; margin-bottom: 8px; }
  &__grid {
    display: grid; grid-template-columns: auto 1fr; gap: 3px 12px;
    margin-bottom: 8px;
    code { font-family: 'Cascadia Code', monospace; font-size: 11px; color: $color-blue; }
    span { font-size: 11px; color: $color-text-secondary; }
  }
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

.cp-elem-row {
  display: flex; align-items: center; gap: 6px;
}
.cp-elem-sel {
  font-family: 'Cascadia Code', monospace; font-size: 11px; color: $color-green;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 280px;
  flex: 1;
}
.cp-elem-clear { padding: 2px 6px; font-size: 11px; }

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

.cp-picking { font-size: 11px; color: $color-blue; font-weight: 600; }
</style>
