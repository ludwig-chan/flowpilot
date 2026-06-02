<!--
  ElementPickerDrawer
  通用的右侧抽屉式 DOM 树选择组件。
  所有需要"选择元素"的场景（单元素、列表推断等）都通过此组件呈现。

  Slots:
    default          — 工具栏上方的自定义内容（如 3 步卡片面板）
    toolbar-status   — 工具栏左侧的状态文字插槽
    below-tree       — 树下方内容（如推断结果预览）
    footer           — 底部按钮栏；若未提供则不渲染底部栏
-->
<script setup lang="ts">
import { ref, computed } from 'vue'
import DomTreeViewer from './DomTreeViewer.vue'
import type { SerializedDomNode } from '@shared/types/dom'

const props = defineProps<{
  title:              string
  domTree:            SerializedDomNode[]
  domFilter:          string
  domScanning:        boolean
  domMutated:         boolean
  domTabTitle:        string
  pickMode:           boolean
  pickedCssSelector:  string
  selectAny?:         boolean    // 允许选任意节点（不只是可交互节点）
  highlightSelector?: string     // 高亮目标，默认用 pickedCssSelector
}>()

const emit = defineEmits<{
  (e: 'close'):                              void
  (e: 'scan'):                               void
  (e: 'toggle-pick'):                        void
  (e: 'select',      node: SerializedDomNode): void
  (e: 'test-click',  css: string):           void
  (e: 'test-action', css: string, actionType: string, value?: string): void
  (e: 'hover',       css: string):           void
  (e: 'update:domFilter', v: string):        void
}>()

// ── pending / more 状态 ────────────────────────────────────────────────────
const pendingNode = ref<SerializedDomNode | null>(null)
const moreNode    = ref<SerializedDomNode | null>(null)
const morePos     = ref({ x: 0, y: 0 })

const pendingCss = computed(() =>
  pendingNode.value?.item?.selector.cssSelector ?? ''
)

const effectiveHighlight = computed(() =>
  pendingCss.value || props.highlightSelector || props.pickedCssSelector
)

const popupStyle = computed(() => {
  // 浮层固定在点击位置左上方，避免超出视口
  const x = Math.max(8, morePos.value.x - 148)
  const y = Math.min(morePos.value.y, window.innerHeight - 220)
  return { left: x + 'px', top: y + 'px' }
})

interface TestAction { type: string; label: string; value?: string; divider?: true }

const TEST_ACTIONS: TestAction[] = [
  // 鼠标
  { type: 'click',        label: '🖱 点击' },
  { type: 'double_click', label: '🖱 双击' },
  { type: 'right_click',  label: '🖱 右键' },
  { type: 'hover',        label: '👆 悬停' },
  // 文本
  { divider: true, type: '', label: '' },
  { type: 'input', label: '⌨️ 输入文本', value: '测试' },
  { type: 'clear', label: '🗑 清空文本' },
  // 表单
  { divider: true, type: '', label: '' },
  { type: 'select',    label: '🔽 选择选项' },
  { type: 'check',     label: '☑ 勾选/取消' },
  { type: 'focus',     label: '🎯 聚焦' },
  { type: 'press_key', label: '⌨️ 按键 Enter', value: 'Enter' },
  // 数据 & 等待
  { divider: true, type: '', label: '' },
  { type: 'get_text',       label: '📋 获取文字' },
  { type: 'wait_appear',    label: '⏳ 等待出现' },
  { type: 'wait_disappear', label: '🕐 等待消失' },
  // 页面
  { divider: true, type: '', label: '' },
  { type: 'scroll_to',   label: '📜 滚动到' },
  { type: 'save_canvas', label: '📷 截图' },
]

function onPending(node: SerializedDomNode) {
  pendingNode.value = node
  // 如果当前 more 面板展示的是另一个元素，关闭它
  const sameCss = moreNode.value?.item?.selector.cssSelector === node.item?.selector.cssSelector
  if (!sameCss) moreNode.value = null
  // 滚动页面到该元素，让用户在确认前能看到它的位置
  const css = node.item?.selector.cssSelector
  if (css) emit('hover', css)
}

function onMore(node: SerializedDomNode, event: MouseEvent) {
  const css = node.item?.selector.cssSelector
  const isSame = moreNode.value?.item?.selector.cssSelector === css
  // 不修改 pendingNode，避免 effectiveHighlight 变化导致滚动
  moreNode.value = isSame ? null : node
  if (!isSame) morePos.value = { x: event.clientX, y: event.clientY }
}

function confirmPending() {
  if (!pendingNode.value) return
  emit('select', pendingNode.value)
  pendingNode.value = null
  moreNode.value    = null
}

function runTestAction(actionType: string, value?: string) {
  const css = moreNode.value?.item?.selector.cssSelector
  if (!css) return
  emit('test-action', css, actionType, value)
  moreNode.value = null
}

function onFilterInput(ev: Event) {
  emit('update:domFilter', (ev.target as HTMLInputElement).value)
}

function onTestClick(node: SerializedDomNode) {
  if (node.item?.selector.cssSelector) emit('test-click', node.item.selector.cssSelector)
}
</script>

<template>
  <div class="epd-overlay" @click.self="emit('close')">
    <div class="epd-panel">

      <!-- ── 标题栏 ── -->
      <div class="epd-panel__header">
        <span class="epd-panel__title">{{ title }}</span>
        <button class="btn btn--ghost btn--icon" @click="emit('close')">✖</button>
      </div>

      <!-- ── 可选：标题栏下方内容（如 3 步卡片面板） ── -->
      <slot />

      <!-- ── 工具栏 ── -->
      <div class="epd-toolbar">
        <div class="epd-toolbar__status">
          <span v-if="domTabTitle" class="epd-toolbar__tab">{{ domTabTitle.slice(0, 22) }}</span>
          <slot name="toolbar-status" />
        </div>
        <div class="epd-toolbar__actions">
          <input
            class="input epd-toolbar__filter"
            :value="domFilter"
            placeholder="过滤节点…"
            @input="onFilterInput"
          />
          <div class="epd-toolbar__scan-wrap">
            <button class="btn" :disabled="domScanning" @click="emit('scan')">
              {{ domScanning ? '扫描中…' : '🔄 刷新' }}
            </button>
            <span
              v-if="domMutated && !domScanning"
              class="epd-toolbar__mutated-dot"
              title="页面 DOM 有变化，建议点击刷新"
            >●</span>
          </div>
          <button
            :class="['btn', { 'btn--active': pickMode }]"
            @click="emit('toggle-pick')"
          >🎯 从页面拾取</button>
        </div>
      </div>

      <!-- ── 待确认选中 ── -->
      <div v-if="pendingNode" class="epd-pending">
        <span class="epd-pending__label">已选：</span>
        <code class="epd-pending__css" :title="pendingCss">{{ pendingCss }}</code>
        <span v-if="pendingNode.w" class="epd-pending__size">
          {{ pendingNode.w }} × {{ pendingNode.h }} px
          <span
            v-if="pendingNode.scrollH"
            class="epd-pending__scroll"
            title="元素内容高度超出可见区域，存在溢出/虚拟渲染"
          >↕ {{ pendingNode.scrollH }}</span>
          <span
            v-if="pendingNode.scrollW"
            class="epd-pending__scroll"
            title="元素内容宽度超出可见区域"
          >↔ {{ pendingNode.scrollW }}</span>
        </span>
        <button class="btn btn--primary" style="flex-shrink:0;padding:2px 10px;font-size:11px" @click="confirmPending">确定 ✓</button>
      </div>

      <!-- ── DOM 树 ── -->
      <div class="epd-tree">
        <div v-if="!domTree.length && !domScanning" class="epd-tree__empty">
          暂无数据，点击「🔄 刷新」重新扫描
        </div>
        <DomTreeViewer
          v-if="domTree.length"
          :nodes="domTree"
          :filter-text="domFilter"
          :select-any="selectAny"
          :highlight-selector="effectiveHighlight"
          @pending="onPending"
          @more="onMore"
          @test-click="onTestClick"
          @hover="emit('hover', $event)"
        />
      </div>

      <!-- ── 可选：树下方内容（如推断结果预览） ── -->
      <slot name="below-tree" />

      <!-- ── 底部按钮栏（仅在提供 footer 插槽时渲染） ── -->
      <div v-if="$slots.footer" class="epd-panel__footer">
        <slot name="footer" />
      </div>

    </div>
  </div>

  <!-- ── 更多动作浮层（Teleport 到 body 避免被裁剪） ── -->
  <Teleport to="body">
    <template v-if="moreNode">
      <div class="epd-more-backdrop" @click="moreNode = null" />
      <div class="epd-more-popup" :style="popupStyle">
        <div class="epd-more-popup__title">触发动作</div>
        <template v-for="(a, i) in TEST_ACTIONS" :key="i">
          <hr v-if="a.divider" class="epd-more-popup__divider" />
          <button
            v-else
            class="epd-more-popup__item"
            @click="runTestAction(a.type, a.value)"
          >{{ a.label }}</button>
        </template>
      </div>
    </template>
  </Teleport>
</template>

<style lang="scss" scoped>
// ── 背景遮罩 ─────────────────────────────────────────────────────────────────
.epd-overlay {
  position: fixed; inset: 0; z-index: 1060;
  background: rgba(0, 0, 0, .55);
  display: flex; align-items: stretch; justify-content: flex-end;
}

// ── 右侧面板 ─────────────────────────────────────────────────────────────────
.epd-panel {
  width: 640px; max-width: 96vw;
  background: #1e1e2e; border-left: 1px solid #45475a;
  display: flex; flex-direction: column; overflow: hidden;

  &__header {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 14px; border-bottom: 1px solid #313244; flex-shrink: 0;
  }
  &__title { font-weight: 700; font-size: 14px; flex: 1; }

  &__footer {
    display: flex; justify-content: flex-end; gap: 8px;
    padding: 10px 14px; border-top: 1px solid #313244; flex-shrink: 0;
  }
}

// ── 工具栏 ───────────────────────────────────────────────────────────────────
.epd-toolbar {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 7px 14px; background: #181825; border-bottom: 1px solid #313244; flex-shrink: 0;

  &__status {
    flex: 1; min-width: 0;
    display: flex; align-items: center; gap: 6px; overflow: hidden;
  }
  &__tab {
    font-size: 11px; color: #6c7086;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  &__actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
  &__filter   { width: 130px; font-size: 11px; padding: 3px 7px; }

  &__scan-wrap { position: relative; display: inline-flex; align-items: center; }
  &__mutated-dot {
    position: absolute; top: -4px; right: -5px;
    font-size: 14px; color: #f9e2af; line-height: 1;
    cursor: default; animation: epd-pulse 1.4s ease-in-out infinite;
  }
  @keyframes epd-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%       { opacity: .5; transform: scale(.75); }
  }
}

// ── 待确认 bar ──────────────────────────────────────────────────────────────
.epd-pending {
  display: flex; align-items: center; gap: 8px;
  padding: 5px 14px; background: #1a2d50; border-bottom: 1px solid #89b4fa40; flex-shrink: 0;

  &__label { font-size: 11px; color: #89b4fa; flex-shrink: 0; }
  &__css {
    font-family: 'Cascadia Code', 'Consolas', monospace; font-size: 11px; color: #89dceb;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;
  }
  &__size  { font-size: 11px; color: #a6e3a1; flex-shrink: 0; white-space: nowrap; display: flex; align-items: center; gap: 4px; }
  &__scroll { color: #f38ba8; font-size: 11px; }
}

// ── DOM 树 ───────────────────────────────────────────────────────────────────
.epd-tree {
  flex: 1; overflow-y: auto; padding: 4px 0;

  &__empty {
    padding: 24px; text-align: center; color: #585b70; font-size: 12px;
  }
}
</style>

<!-- 浮层样式需脱离 scoped 才能作用于 Teleport 内容 -->
<style lang="scss">
.epd-more-backdrop {
  position: fixed; inset: 0; z-index: 1070;
}
.epd-more-popup {
  position: fixed; z-index: 1071;
  background: #313244; border: 1px solid #585b70; border-radius: 8px;
  padding: 4px; min-width: 130px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, .6);

  &__title {
    font-size: 10px; color: #6c7086; padding: 4px 10px 2px;
    text-transform: uppercase; letter-spacing: .05em;
  }
  &__item {
    display: block; width: 100%;
    background: transparent; border: none; border-radius: 5px;
    color: #cdd6f4; cursor: pointer; font-size: 13px;
    padding: 7px 12px; text-align: left; white-space: nowrap;
    &:hover { background: #45475a; color: #fff; }
    &:active { background: #585b70; }
  }
  &__divider {
    border: none; border-top: 1px solid #45475a; margin: 3px 8px;
  }
}
</style>
