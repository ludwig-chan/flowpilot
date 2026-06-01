<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import ElementPickerDrawer from './ElementPickerDrawer.vue'
import type { SerializedDomNode } from '@shared/types/dom'

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
  <div class="cp-overlay" @click.self="emit('close')">
    <div class="cp-modal">

      <div class="cp-modal__header">
        <span class="cp-modal__title">🔀 条件判断</span>
        <button class="btn btn--ghost btn--icon" @click="emit('close')">✖</button>
      </div>

      <!-- 标签 -->
      <div class="cp-field">
        <label class="cp-field__label">步骤标签</label>
        <input
          v-model="label"
          class="input"
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
          <input
            ref="exprInputEl"
            v-model="exprValue"
            class="input"
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
              <button class="btn btn--ghost btn--sm cp-elem-clear" @click="elemSelector = ''">✕</button>
              <button class="btn btn--sm" @click="openElemPicker">重选</button>
            </template>
            <button v-else class="btn btn--sm btn--primary" @click="openElemPicker">
              选择元素…
            </button>
          </div>
        </div>
        <div class="cp-hints">
          <div class="cp-hints__note">
            🔍 运行时若该元素<strong>存在于页面</strong>则条件成立，否则执行 ELSE 分支
          </div>
        </div>
      </template>

      <!-- 底部按钮 -->
      <div class="cp-modal__footer">
        <button class="btn" @click="emit('close')">取消</button>
        <button class="btn btn--primary" :disabled="!canConfirm" @click="confirm">确认</button>
      </div>

    </div>
  </div>

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
.cp-overlay {
  position: fixed; inset: 0; z-index: 1050;
  background: rgba(0, 0, 0, .55);
  display: flex; align-items: center; justify-content: center;
}

.cp-modal {
  width: 500px; max-width: 94vw;
  background: #1e1e2e; border: 1px solid #45475a; border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, .5);
  display: flex; flex-direction: column; gap: 0; overflow: hidden;

  &__header {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 14px; border-bottom: 1px solid #313244;
  }
  &__title { font-weight: 700; font-size: 14px; flex: 1; }
  &__footer {
    display: flex; justify-content: flex-end; gap: 8px;
    padding: 10px 14px; border-top: 1px solid #313244; margin-top: 4px;
  }
}

.cp-field {
  padding: 10px 14px 0;
  display: flex; flex-direction: column; gap: 5px;
  &__label { font-size: 11px; font-weight: 600; color: #6c7086; text-transform: uppercase; letter-spacing: .04em; }
}

.cp-mode-tabs {
  display: flex; gap: 4px;
}

.cp-mode-tab {
  flex: 1; padding: 6px 10px; border: 1px solid #45475a; border-radius: 5px;
  background: #181825; color: #a6adc8; cursor: pointer; font-size: 12px;
  transition: all .15s;
  &:hover { background: #313244; color: #cdd6f4; }
  &--active { background: #1e3a5f; border-color: #89b4fa; color: #89b4fa; font-weight: 600; }
}

.cp-hints {
  margin: 8px 14px 0; padding: 10px 12px;
  background: #181825; border: 1px solid #313244; border-radius: 6px;

  &__title { font-size: 11px; font-weight: 600; color: #6c7086; margin-bottom: 8px; }
  &__grid {
    display: grid; grid-template-columns: auto 1fr; gap: 3px 12px;
    margin-bottom: 8px;
    code { font-family: 'Cascadia Code', monospace; font-size: 11px; color: #89b4fa; }
    span { font-size: 11px; color: #a6adc8; }
  }
  &__example {
    font-size: 11px; color: #a6adc8; margin-bottom: 6px;
    code { font-family: 'Cascadia Code', monospace; color: #cba6f7; }
  }
  &__note {
    font-size: 11px; color: #6c7086; line-height: 1.5;
    code { font-family: 'Cascadia Code', monospace; color: #f9e2af; }
    strong { color: #a6e3a1; }
  }
}

.cp-elem-row {
  display: flex; align-items: center; gap: 6px;
}
.cp-elem-sel {
  font-family: 'Cascadia Code', monospace; font-size: 11px; color: #a6e3a1;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 280px;
  flex: 1;
}
.cp-elem-clear { padding: 2px 6px; font-size: 11px; }

.cp-vars {
  display: flex; flex-wrap: wrap; align-items: center; gap: 5px;
  padding: 6px 14px 0;
  &__label { font-size: 11px; color: #6c7086; white-space: nowrap; }
}

.cp-var-chip {
  padding: 2px 8px; border: 1px solid #45475a; border-radius: 4px;
  background: #181825; color: #cba6f7;
  font-family: 'Cascadia Code', monospace; font-size: 11px;
  cursor: pointer; transition: all .12s;
  &:hover { background: #313244; border-color: #cba6f7; color: #f5c2e7; }
}

.cp-picking { font-size: 11px; color: #89b4fa; font-weight: 600; }
</style>
