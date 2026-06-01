<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import ElementPickerDrawer from './ElementPickerDrawer.vue'
import type { SerializedDomNode, SerializedElement } from '@shared/types/dom'

// ── Props / Emits ────────────────────────────────────────────────────────────
const props = defineProps<{
  domTree:              SerializedDomNode[]
  domFilter:            string
  domScanning:          boolean
  domMutated:           boolean
  domTabTitle:          string
  pickMode:             boolean
  pickedCssSelector:    string
  /** 从 EditLoopModal 重选子项时传入，预充列表项并自动切换到直接模式 */
  initialDirectItemSel?: string
}>()

const emit = defineEmits<{
  (e: 'close'):                              void
  (e: 'scan'):                               void
  (e: 'toggle-pick'):                        void
  (e: 'update:domFilter', v: string):        void
  (e: 'hover', css: string):                 void
  (e: 'test-action', css: string, actionType: string, value?: string): void
  /** 全部就绪，父组件可据此打开 ActionPickerModal */
  (e: 'done', itemSel: string, targetEl: SerializedElement, relSel: string): void
  /** 直接选择模式：用户选了一个列表项元素，直接建立循环步骤 */
  (e: 'done-direct', itemSel: string): void
}>()

// ── Slot State ───────────────────────────────────────────────────────────────
type SlotKey = 'b' | 'c'

interface SlotState {
  node: SerializedDomNode | null
  css:  string
}

const slots = ref<Record<SlotKey, SlotState>>({
  b: { node: null, css: '' },
  c: { node: null, css: '' },
})

const activeSlot = ref<SlotKey>('b')

const SLOT_LABELS: Record<SlotKey, string> = {
  b: '第 1 个列表项',
  c: '第 2 个列表项（不同行）',
}

const SLOT_HINTS: Record<SlotKey, string> = {
  b: '选择列表中第一行你想要操作的元素，如某行的按钮或链接',
  c: '选择另一行中相同类型的元素，系统将从中推断循环规律',
}

// ── Picker overlay ───────────────────────────────────────────────────────────
const showPicker = ref(false)

// 控制 ElementPickerDrawer 内高亮目标的 CSS，与 slot 已选值解耦：
// 重选时初始化为当前已选，页面拾取时更新为新选，避免旧值遮盖新拾取
const pickerHighlight = ref('')

function openPickerForSlot(key: SlotKey) {
  activeSlot.value      = key
  pickerTarget.value    = key
  pickerHighlight.value = slots.value[key].css
  if (!showPicker.value) {
    showPicker.value = true
    emit('scan')
  }
}

// ── Result state ─────────────────────────────────────────────────────────────
const showResult = ref(false)

// ── Node → CSS helper ────────────────────────────────────────────────────────
function nodeCss(node: SerializedDomNode): string {
  if (node.item?.selector.cssSelector) return node.item.selector.cssSelector
  let sel = node.tag
  if (node.id)      sel += `#${node.id}`
  else if (node.classes) {
    const first = node.classes.trim().split(/\s+/)[0]
    if (first) sel += `.${first}`
  }
  return sel
}

// ── DomTree selection ────────────────────────────────────────────────────────
function onNodeSelected(node: SerializedDomNode) {
  const css = nodeCss(node)

  // 直接选择模式：存入 directNode 或 directChildNode
  if (pickerTarget.value === 'direct-item') {
    directNode.value      = { node, css }
    directChildNode.value = { node: null, css: '' }  // 列表项变了，子项重置
    showPicker.value = false
    return
  }
  if (pickerTarget.value === 'direct-child') {
    directChildNode.value = { node, css }
    showPicker.value = false
    return
  }

  if (activeSlot.value === 'c' && css === slots.value.b.css) {
    alert('请选择与第 1 项不同行的同类元素，两者的 CSS 路径应仅 nth-child 数字不同')
    return
  }

  slots.value[activeSlot.value] = { node, css }
  showResult.value = false
  // 选完直接关闭抽屉，由用户手动打开下一个
  showPicker.value = false
}

function clearSlot(key: SlotKey) {
  slots.value[key] = { node: null, css: '' }
  showResult.value = false
}

// ── 模式 / 直接选择 ────────────────────────────────────────────────────────────
type PickerTarget = SlotKey | 'direct-item' | 'direct-child'
const mode            = ref<'infer' | 'direct'>('infer')
const pickerTarget    = ref<PickerTarget>('b')
const directNode      = ref<{ node: SerializedDomNode | null; css: string }>({ node: null, css: '' })
const directChildNode = ref<{ node: SerializedDomNode | null; css: string }>({ node: null, css: '' })

/** 两个 slot 都选好时，计算循环选择器和子元素相对路径 */
const directResult = computed(() => {
  const itemCss  = directNode.value.css
  const childCss = directChildNode.value.css
  if (!itemCss || !childCss) return null
  const itemSegs  = itemCss.split(/\s*>\s*/)
  const stripPos  = (s: string) => s.replace(/:nth-child\(\d+\)/g, '').replace(/:nth-of-type\(\d+\)/g, '')
  // 列表项最后一段同时去掉唯一 ID（唯一 ID 随每项变化，不能作为循环选择器的一部分）
  const stripItem = (s: string) => stripPos(s).replace(/#[\w-]+/g, '')
  const itemSel   = [...itemSegs.slice(0, -1), stripItem(itemSegs[itemSegs.length - 1])].join(' > ')
  const childSegs = childCss.split(/\s*>\s*/)
  let i = 0
  while (i < itemSegs.length && i < childSegs.length) {
    if (stripPos(childSegs[i]) !== stripPos(itemSegs[i])) break
    i++
  }
  const relSel = childSegs.slice(i).join(' > ')
  return { itemSel, relSel }
})

watch(mode, () => { showResult.value = false; showPicker.value = false })

function openPickerForDirectItem() {
  pickerTarget.value    = 'direct-item'
  pickerHighlight.value = directNode.value.css
  if (!showPicker.value) { showPicker.value = true; emit('scan') }
}

function openPickerForDirectChild() {
  pickerTarget.value    = 'direct-child'
  // 子项未选时，用列表项 CSS 作初始高亮，让 picker 滚动到列表项所在区域
  pickerHighlight.value = directChildNode.value.css || directNode.value.css
  if (!showPicker.value) { showPicker.value = true; emit('scan') }
}

function clearDirect() {
  directNode.value      = { node: null, css: '' }
  directChildNode.value = { node: null, css: '' }
}

function clearDirectChild() { directChildNode.value = { node: null, css: '' } }

/** 从 EditLoopModal 重选子项时：预填列表项并自动打开子项 picker */
onMounted(() => {
  if (props.initialDirectItemSel) {
    mode.value       = 'direct'
    directNode.value = { node: null, css: props.initialDirectItemSel }
    nextTick(() => openPickerForDirectChild())
  }
})

function confirmDirect() {
  if (!directResult.value) return
  const { itemSel, relSel } = directResult.value
  const childCss = directChildNode.value.css
  const targetEl: SerializedElement = directChildNode.value.node?.item ?? {
    kind:       'unknown',
    confidence: 'low',
    label:      childCss.split('>').pop()?.trim() ?? '',
    matchCount: 1,
    selector:   { cssSelector: childCss },
  }
  emit('done', itemSel, targetEl, relSel)
}

// 页面拾取后，不再直接保存到 slot（跳过确认），而是更新 pickerHighlight，
// 让 ElementPickerDrawer → DomTreeViewer 的 watcher 触发 pending，
// 用户仍需点击「确定 ✓」才真正保存
watch(() => props.pickedCssSelector, (css) => {
  if (!css || !showPicker.value) return
  pickerHighlight.value = css
})

function findNodeByCss(nodes: SerializedDomNode[], css: string): SerializedDomNode[] | null {
  for (const n of nodes) {
    if (nodeCss(n) === css) return [n]
    const found = findNodeByCss(n.children, css)
    if (found) return [n, ...found]
  }
  return null
}

// ── Inference ────────────────────────────────────────────────────────────────
const allFilled = computed(() =>
  !!slots.value.b.css && !!slots.value.c.css
)

function inferStructure(): { itemSel: string; relSel: string } {
  const selB = slots.value.b.css
  const selC = slots.value.c.css
  // 只去位置伪类（用于祖先路径比较 & 子路径保留）
  const strip = (s: string) => s.replace(/:nth-child\(\d+\)/g, '')
  // 列表项层级：同时去掉唯一 ID（唯一 ID 在不同项里各不相同，无法匹配所有项）
  const stripItem = (s: string) => s
    .replace(/:nth-child\(\d+\)/g, '').replace(/:nth-of-type\(\d+\)/g, '')
    .replace(/#[\w-]+/g, '')

  const segsB = selB.split(/\s*>\s*/)
  const segsC = selC.split(/\s*>\s*/)

  const minLen = Math.min(segsB.length, segsC.length)
  let divergeIdx = -1

  for (let i = 0; i < minLen; i++) {
    if (segsB[i] !== segsC[i]) {
      // nth-child-only difference = repeating item boundary
      if (strip(segsB[i]) === strip(segsC[i])) {
        divergeIdx = i
        break
      }
      // Segments differ in more than just nth-child — first divergence is item boundary
      divergeIdx = i
      break
    }
  }

  if (divergeIdx < 0) {
    // All segments match: can't infer — fallback to first item selector
    return { itemSel: selB, relSel: '' }
  }

  const itemSel = [
    ...segsB.slice(0, divergeIdx).map(strip), // 祖先路径：只去位置伪类，保留稳定 ID
    stripItem(segsB[divergeIdx])               // 列表项本身：同时去掉唯一 ID
  ].join(' > ')
  const relSel  = segsB.slice(divergeIdx + 1).join(' > ')
  return { itemSel, relSel }
}

const inferred = computed<{ itemSel: string; relSel: string } | null>(() => {
  if (!allFilled.value) return null
  return inferStructure()
})

function tryInfer() {
  showResult.value = true
}

// ── Confirm ──────────────────────────────────────────────────────────────────
function confirm() {
  if (!inferred.value) return
  const { itemSel, relSel } = inferred.value

  let targetEl = slots.value.b.node?.item ?? null
  if (!targetEl) {
    // Node has no item — synthesize a SerializedElement for the child step
    targetEl = {
      kind:       'unknown',
      confidence: 'low',
      label:      slots.value.b.css.split('>').pop()?.trim() ?? '',
      matchCount: 1,
      selector:   { cssSelector: slots.value.b.css },
    }
  }

  emit('done', itemSel, targetEl, relSel)
}

</script>

<template>
  <!-- ── 主弹窗 ── -->
  <div class="lb-overlay" @click.self="emit('close')">
    <div class="lb-modal">

      <div class="lb-modal__header">
        <span class="lb-modal__title">📋 选择列表</span>
        <button class="btn btn--ghost btn--icon" @click="emit('close')">✖</button>
      </div>

      <!-- 模式选项卡 -->
      <div class="lb-mode-bar">
        <button :class="['lb-mode-btn', { 'lb-mode-btn--active': mode === 'infer' }]" @click="mode = 'infer'">子项推断</button>
        <button :class="['lb-mode-btn', { 'lb-mode-btn--active': mode === 'direct' }]" @click="mode = 'direct'">直接选择</button>
      </div>

      <!-- 子项推断行 -->
      <div v-if="mode === 'infer'" class="lb-rows">
        <div
          v-for="key in (['b', 'c'] as const)"
          :key="key"
          class="lb-row"
        >
          <div class="lb-row__left">
            <span :class="['lb-row__badge', { 'lb-row__badge--filled': !!slots[key].css }]">{{ key }}</span>
            <div class="lb-row__info">
              <span class="lb-row__label">{{ SLOT_LABELS[key] }}</span>
              <span class="lb-row__hint">{{ SLOT_HINTS[key] }}</span>
            </div>
          </div>
          <div class="lb-row__right">
            <template v-if="slots[key].css">
              <code class="lb-row__sel" :title="slots[key].css">{{ slots[key].css }}</code>
              <button class="btn btn--ghost btn--icon lb-row__clear" @click="clearSlot(key)">✕</button>
              <button class="btn lb-row__resel" @click="openPickerForSlot(key)">重选</button>
            </template>
            <button v-else class="btn lb-row__pick" @click="openPickerForSlot(key)">
              选择元素…
            </button>
          </div>
        </div>
      </div>

      <!-- 推断结果 -->
      <transition name="lb-slide">
        <div v-if="mode === 'infer' && showResult && inferred" class="lb-result">
          <div class="lb-result__title">✓ 推断成功</div>
          <div class="lb-result__row">
            <span class="lb-result__key">循环选择器</span>
            <code class="lb-result__val">{{ inferred.itemSel }}</code>
          </div>
          <div v-if="inferred.relSel" class="lb-result__row">
            <span class="lb-result__key">子元素路径</span>
            <code class="lb-result__val">{{ inferred.relSel }}</code>
          </div>
          <div v-else class="lb-result__row">
            <span class="lb-result__note">⚠ 未推断出相对路径，子步骤将直接作用于列表项本身</span>
          </div>
        </div>
      </transition>

      <!-- 直接选择区域 -->
      <div v-if="mode === 'direct'" class="lb-rows">
        <div class="lb-direct-hint">先选一个列表项（如 li、.card），再选该项内的操作目标，系统将自动推断循环规律</div>

        <!-- 行 1：列表项 -->
        <div class="lb-row">
          <div class="lb-row__left">
            <span :class="['lb-row__badge', { 'lb-row__badge--filled': !!directNode.css }]">1</span>
            <div class="lb-row__info">
              <span class="lb-row__label">列表项元素</span>
              <span class="lb-row__hint">选择某行容器，如 li、.card、tr 等</span>
            </div>
          </div>
          <div class="lb-row__right">
            <template v-if="directNode.css">
              <code class="lb-row__sel" :title="directNode.css">{{ directNode.css }}</code>
              <button class="btn btn--ghost btn--icon lb-row__clear" @click="clearDirect">✕</button>
              <button class="btn lb-row__resel" @click="openPickerForDirectItem">重选</button>
            </template>
            <button v-else class="btn lb-row__pick" @click="openPickerForDirectItem">选择元素…</button>
          </div>
        </div>

        <!-- 行 2：子元素（列表项未选时禁用） -->
        <div class="lb-row" :class="{ 'lb-row--disabled': !directNode.css }">
          <div class="lb-row__left">
            <span :class="['lb-row__badge', { 'lb-row__badge--filled': !!directChildNode.css }]">2</span>
            <div class="lb-row__info">
              <span class="lb-row__label">操作目标子元素</span>
              <span class="lb-row__hint">选择列表项内要操作的元素，如按钮、链接等</span>
            </div>
          </div>
          <div class="lb-row__right">
            <template v-if="directChildNode.css">
              <code class="lb-row__sel" :title="directChildNode.css">{{ directChildNode.css }}</code>
              <button class="btn btn--ghost btn--icon lb-row__clear" @click="clearDirectChild">✕</button>
              <button class="btn lb-row__resel" @click="openPickerForDirectChild">重选</button>
            </template>
            <button v-else class="btn lb-row__pick" :disabled="!directNode.css" @click="openPickerForDirectChild">选择元素…</button>
          </div>
        </div>

        <!-- 推断结果 -->
        <transition name="lb-slide">
          <div v-if="directResult" class="lb-result lb-result--direct">
            <div class="lb-result__title">✓ 推断成功</div>
            <div class="lb-result__row">
              <span class="lb-result__key">循环选择器</span>
              <code class="lb-result__val">{{ directResult.itemSel }}</code>
            </div>
            <div v-if="directResult.relSel" class="lb-result__row">
              <span class="lb-result__key">子元素路径</span>
              <code class="lb-result__val">{{ directResult.relSel }}</code>
            </div>
            <div v-else class="lb-result__row">
              <span class="lb-result__note">⚠ 子元素与列表项相同，将直接操作列表项本身</span>
            </div>
          </div>
        </transition>
      </div>

      <!-- 底部按钮 -->
      <div class="lb-modal__footer">
        <button class="btn" @click="emit('close')">取消</button>
        <template v-if="mode === 'infer'">
          <template v-if="!showResult">
            <button
              class="btn btn--primary"
              :disabled="!allFilled"
              @click="tryInfer"
            >⏳ 尝试获取列表 →</button>
          </template>
          <template v-else>
            <button class="btn" @click="showResult = false">重新推断</button>
            <button class="btn btn--primary" @click="confirm">确认并选择动作 →</button>
          </template>
        </template>
        <template v-else>
          <button
            class="btn btn--primary"
            :disabled="!directResult"
            @click="confirmDirect"
          >确认并选择动作 →</button>
        </template>
      </div>

    </div>
  </div>

  <!-- ── 元素选择抽屉（叠加在主弹窗上方）── -->
  <ElementPickerDrawer
    v-if="showPicker"
    :title="`🖱 选择：${pickerTarget === 'direct-item' ? '列表项元素' : pickerTarget === 'direct-child' ? '操作目标子元素' : SLOT_LABELS[activeSlot]}`"
    :dom-tree="domTree"
    :dom-filter="domFilter"
    :dom-scanning="domScanning"
    :dom-mutated="domMutated"
    :dom-tab-title="domTabTitle"
    :pick-mode="pickMode"
    :picked-css-selector="pickedCssSelector"
    :select-any="true"
    :highlight-selector="pickerHighlight"
    @close="showPicker = false"
    @scan="emit('scan')"
    @toggle-pick="emit('toggle-pick')"
    @select="onNodeSelected"
    @hover="emit('hover', $event)"
    @test-action="(css: string, type: string, val?: string) => emit('test-action', css, type, val)"
    @update:dom-filter="emit('update:domFilter', $event)"
  >
    <template #toolbar-status>
      <span class="lb-picking">{{ pickerTarget === 'direct-item' ? '● 正在选择列表项元素' : pickerTarget === 'direct-child' ? '● 正在选择操作目标子元素' : `● 正在填入 (${activeSlot}) — ${SLOT_LABELS[activeSlot]}` }}</span>
    </template>
  </ElementPickerDrawer>
</template>

<style lang="scss" scoped>
// ── 主弹窗 ────────────────────────────────────────────────────────────────────────
.lb-overlay {
  position: fixed; inset: 0; z-index: 1050;
  background: rgba(0, 0, 0, .55);
  display: flex; align-items: center; justify-content: center;
}

.lb-modal {
  width: 540px; max-width: 94vw;
  background: #1e1e2e; border: 1px solid #45475a; border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, .5);
  display: flex; flex-direction: column; overflow: hidden;

  &__header {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 14px; border-bottom: 1px solid #313244;
  }
  &__title { font-weight: 700; font-size: 14px; flex: 1; }
  &__footer {
    display: flex; justify-content: flex-end; gap: 8px;
    padding: 10px 14px; border-top: 1px solid #313244;
  }
}

// ── 3 步骤行 ─────────────────────────────────────────────────────────────────────
.lb-rows { display: flex; flex-direction: column; }

.lb-row {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 10px;
  padding: 10px 14px; border-bottom: 1px solid #1a1a28;

  &__left  { display: flex; gap: 10px; align-items: flex-start; flex: 1; min-width: 0; }
  &__badge {
    width: 20px; height: 20px; border-radius: 50%;
    background: #45475a; color: #cdd6f4; font-size: 11px; font-weight: 700;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    margin-top: 1px; transition: background .15s;
    &--filled { background: #a6e3a1; color: #1e1e2e; }
  }
  &__info  { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  &__label { font-size: 12px; font-weight: 600; color: #cdd6f4; }
  &__hint  { font-size: 10px; color: #585b70; line-height: 1.4; }

  &__right { display: flex; align-items: center; gap: 6px; flex-shrink: 0; max-width: 200px; }
  &__sel {
    font-family: 'Cascadia Code', monospace; font-size: 11px; color: #a6e3a1;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 120px;
  }
  &__clear { padding: 2px 4px; font-size: 11px; }
  &__resel { font-size: 11px; padding: 3px 8px; }
  &__pick  { font-size: 11px; padding: 3px 10px; }
}

// ── 推断结果 ─────────────────────────────────────────────────────────────────────────
.lb-result {
  margin: 6px 14px 4px;
  padding: 10px 12px; background: #181825;
  border: 1px solid #a6e3a1; border-radius: 6px;

  &__title { font-size: 12px; font-weight: 700; color: #a6e3a1; margin-bottom: 8px; }
  &__row { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; }
  &__key { font-size: 10px; color: #6c7086; flex-shrink: 0; width: 72px; }
  &__val {
    font-family: 'Cascadia Code', monospace; font-size: 11px; color: #a6e3a1;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 360px;
  }
  &__note { font-size: 10px; color: #f9e2af; }
}

.lb-slide-enter-active, .lb-slide-leave-active { transition: all .2s ease; }
.lb-slide-enter-from, .lb-slide-leave-to { opacity: 0; transform: translateY(-6px); }

// ── 抽屉状态文字 ──────────────────────────────────────────────────────────────────
.lb-picking { font-size: 11px; color: #89b4fa; font-weight: 600; }

// ── 模式选项卡 ────────────────────────────────────────────────────────────────
.lb-mode-bar {
  display: flex; border-bottom: 1px solid #1a1a28;
}
.lb-mode-btn {
  flex: 1; padding: 6px; font-size: 11px; font-weight: 600;
  background: transparent; border: none; color: #6c7086; cursor: pointer;
  border-bottom: 2px solid transparent; transition: all .15s;
  &:hover { color: #cdd6f4; }
  &--active { color: #89b4fa; border-bottom-color: #89b4fa; }
}

// ── 直接选择提示 ───────────────────────────────────────────────────────────────
.lb-direct-hint {
  font-size: 10px; color: #585b70; padding: 8px 14px 2px; line-height: 1.4;
}

// ── 直接选择结果 ───────────────────────────────────────────────────────────────
.lb-result--direct {
  border-color: #89b4fa;
  .lb-result__title { color: #89b4fa; }
  .lb-result__val   { color: #89b4fa; }
}

.lb-row--disabled { opacity: .45; pointer-events: none; }
</style>
