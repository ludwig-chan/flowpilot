<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import type { SerializedDomNode } from '@shared/types/dom'

const props = defineProps<{
  nodes:              SerializedDomNode[]
  filterText?:        string
  selectAny?:         boolean   // 允许点击任意节点（含非交互节点），用于列表拾取第1步
  highlightSelector?: string    // 从页面拾取后，自动高亮 + 展开该节点
}>()

const emit = defineEmits<{
  (e: 'select',    node: SerializedDomNode): void
  (e: 'pending',   node: SerializedDomNode): void
  (e: 'testClick', node: SerializedDomNode): void
  (e: 'more',      node: SerializedDomNode, event: MouseEvent): void
  (e: 'hover',     cssSelector: string):     void
}>()

const collapsed        = ref(new Set<string>())
const highlightedKey   = ref('')
const highlightedEl    = ref<HTMLElement | null>(null)

function nodeKey(node: SerializedDomNode): string {
  return `${node.depth}:${node.tag}${node.id ? '#' + node.id : ''}:${node.item?.selector.cssSelector ?? ''}`
}

function toggle(node: SerializedDomNode) {
  const k = nodeKey(node)
  if (collapsed.value.has(k)) collapsed.value.delete(k)
  else collapsed.value.add(k)
}

const filter = computed(() => props.filterText?.toLowerCase().trim() ?? '')

// 当 highlightSelector 变化时（如页面拾取），找到匹配节点，展开路径并高亮
watch(() => props.highlightSelector, (sel) => {
  if (!sel) { highlightedKey.value = ''; return }
  const path = findNodeByCss(props.nodes, sel)
  if (!path) return
  // 展开所有祖先
  for (const n of path.slice(0, -1)) collapsed.value.delete(nodeKey(n))
  const target = path[path.length - 1]
  const newKey = nodeKey(target)
  // 若已经高亮此节点（说明是用户主动点击行触发的，非页面拾取），不滚动
  const wasAlreadyHighlighted = highlightedKey.value === newKey
  highlightedKey.value = newKey
  emit('pending', target)
  // 只有来自页面拾取（节点未高亮）时才滚动
  if (!wasAlreadyHighlighted) {
    nextTick(() => {
      highlightedEl.value?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
  }
})

// 点击行触发的 pending（高亮更新 + 通知父组件）
function onRowPending(node: SerializedDomNode) {
  highlightedKey.value = nodeKey(node)
  emit('pending', node)
}

function findNodeByCss(nodes: SerializedDomNode[], css: string): SerializedDomNode[] | null {
  for (const n of nodes) {
    if (n.item?.selector.cssSelector === css) return [n]
    const found = findNodeByCss(n.children, css)
    if (found) return [n, ...found]
  }
  return null
}
</script>

<template>
  <div class="dom-tree">
    <DomTreeNode
      v-for="(node, i) in nodes"
      :key="i"
      :node="node"
      :filter="filter"
      :select-any="selectAny"
      :collapsed-set="collapsed"
      :highlighted-key="highlightedKey"
      :highlighted-el-setter="(el: HTMLElement | null) => { if (el) highlightedEl = el }"
      @toggle="toggle"
      @select="emit('select', $event)"
      @pending="onRowPending"
      @test-click="emit('testClick', $event)"
      @more="(n, e) => emit('more', n, e)"
      @hover="emit('hover', $event)"
    />
  </div>
</template>

<!-- DomTreeNode 递归组件 -->
<script lang="ts">
import { defineComponent, h, computed as vComputed } from 'vue'

const DomTreeNode = defineComponent({
  name: 'DomTreeNode',
  props: {
    node:               { type: Object as () => SerializedDomNode, required: true },
    filter:             { type: String,  default: '' },
    selectAny:          { type: Boolean, default: false },
    collapsedSet:       { type: Object as () => Set<string>, required: true },
    highlightedKey:     { type: String,  default: '' },
    highlightedElSetter:{ type: Function as unknown as () => (el: HTMLElement | null) => void, default: null },
  },
  emits: ['toggle', 'select', 'pending', 'testClick', 'more', 'hover'],
  setup(props) {
    function nodeKey(n: SerializedDomNode): string {
      return `${n.depth}:${n.tag}${n.id ? '#' + n.id : ''}:${n.item?.selector.cssSelector ?? ''}`
    }
    const isCollapsed  = vComputed(() => props.collapsedSet.has(nodeKey(props.node)))
    const hasChildren  = vComputed(() => props.node.children.length > 0)
    const isHighlighted = vComputed(() => nodeKey(props.node) === props.highlightedKey)

    function matchesFilter(n: SerializedDomNode): boolean {
      if (!props.filter) return true
      const hay = [n.tag, n.id, n.classes, n.item?.label, n.item?.selector.cssSelector]
        .filter(Boolean).join(' ').toLowerCase()
      return hay.includes(props.filter)
    }
    const visible = vComputed(() => matchesFilter(props.node))
    return { isCollapsed, hasChildren, isHighlighted, visible, nodeKey }
  },
  render() {
    if (!this.visible && !this.node.children.length) return null

    const { node, filter, collapsedSet, highlightedKey, highlightedElSetter, selectAny } = this
    const item = node.item

    const confidenceColor: Record<string, string> = {
      high: '#a6e3a1', medium: '#f9e2af', low: '#6c7086',
    }
    const kindIcon: Record<string, string> = {
      click: '🖱', input: '⌨', select: '📋', unknown: '？',
    }

    const rowEl = h('div', {
      class: [
        'dt-row',
        item ? 'dt-row--actionable' : '',
        selectAny ? 'dt-row--pick' : '',
        this.isHighlighted ? 'dt-row--highlighted' : '',
      ],
      style: { paddingLeft: `${node.depth * 14 + 4}px` },
      title: item
        ? `${item.label}\n${item.selector.cssSelector}`
        : `<${node.tag}${node.id ? '#' + node.id : ''}${node.classes ? '.' + node.classes.trim().split(/\s+/)[0] : ''}>`,
      ref: this.isHighlighted && highlightedElSetter
        ? (el: unknown) => highlightedElSetter(el as HTMLElement | null)
        : undefined,
      onClick: (e: MouseEvent) => {
        e.stopPropagation()
        if (item || selectAny) { this.$emit('pending', node); return }
        if (this.hasChildren) this.$emit('toggle', node)
      },
      onMouseenter: () => {
        const css = item?.selector.cssSelector
        if (css) this.$emit('hover', css)
      },
      onMouseleave: () => {
        this.$emit('hover', '')
      },
    }, [
      // 展开/收起箭头
      this.hasChildren
        ? h('span', {
            class: 'dt-arrow',
            onClick: (e: MouseEvent) => { e.stopPropagation(); this.$emit('toggle', node) },
          }, this.isCollapsed ? '▶' : '▼')
        : h('span', { class: 'dt-arrow dt-arrow--leaf' }, '·'),

      // 标签名
      h('span', { class: 'dt-tag' }, `<${node.tag}${node.id ? '#' + node.id : ''}>`),

      // 可操作标记（label）
      item ? h('span', {
        class: 'dt-badge',
        style: { color: confidenceColor[item.confidence] ?? '#cdd6f4' },
        title: item.selector.cssSelector,
      }, `${kindIcon[item.kind] ?? '？'} ${item.label.slice(0, 36)}`) : null,

      // 操作按钮组（hover 时显示）
      item ? h('span', { class: 'dt-actions', onClick: (e: MouseEvent) => e.stopPropagation() }, [
        // 试点击按钮
        h('button', {
          class: 'dt-action-btn dt-action-btn--test',
          title: '试点击（在页面上触发真实 click）',
          onClick: (e: MouseEvent) => { e.stopPropagation(); this.$emit('testClick', node) },
        }, '▷ 试'),
        // 更多动作按钮
        h('button', {
          class: 'dt-action-btn dt-action-btn--more',
          title: '更多动作',
          onClick: (e: MouseEvent) => { e.stopPropagation(); this.$emit('more', node, e) },
        }, '⋯'),
      ]) : null,
    ])

    const children = !this.isCollapsed && node.children.length
      ? node.children.map((child, i) =>
          h(DomTreeNode, {
            key: i,
            node: child,
            filter,
            selectAny,
            collapsedSet,
            highlightedKey,
            highlightedElSetter,
            onToggle:    (n: SerializedDomNode) => this.$emit('toggle', n),
            onSelect:    (n: SerializedDomNode) => this.$emit('select', n),
            onPending:   (n: SerializedDomNode) => this.$emit('pending', n),
            onTestClick: (n: SerializedDomNode) => this.$emit('testClick', n),
            onMore:      (n: SerializedDomNode, e: MouseEvent) => this.$emit('more', n, e),
            onHover:     (css: string) => this.$emit('hover', css),
          }))
      : []

    return h('div', { class: 'dt-node' }, [rowEl, ...children])
  },
})

export { DomTreeNode }
</script>

<style scoped lang="scss">
.dom-tree { font-size: 12px; font-family: 'Cascadia Code', 'Consolas', monospace; }

:deep(.dt-node) { user-select: none; }

:deep(.dt-row) {
  display: flex; align-items: center; gap: 6px;
  padding: 2px 4px 2px 4px; border-radius: 3px; cursor: pointer;
  white-space: nowrap; overflow: hidden;
  &:hover { background: #313244; }
  &:hover .dt-actions { opacity: 1; }
}
:deep(.dt-row--pick):hover { background: #1a3a5f; cursor: crosshair; }
:deep(.dt-row--highlighted) {
  background: #1e3a5f !important;
  outline: 2px solid #89b4fa;
  border-radius: 3px;
  animation: dt-hl-flash 0.6s ease-out;
}
@keyframes dt-hl-flash {
  0%   { background: #3a6aaf; outline-color: #cdd6f4; }
  100% { background: #1e3a5f; outline-color: #89b4fa; }
}

:deep(.dt-arrow) {
  flex-shrink: 0; width: 12px; font-size: 9px; color: #6c7086;
}
:deep(.dt-arrow--leaf) { cursor: default; }

:deep(.dt-tag) { color: #89b4fa; flex-shrink: 0; }

:deep(.dt-badge) {
  overflow: hidden; text-overflow: ellipsis;
  font-size: 11px; color: #cdd6f4; flex: 1; min-width: 0;
}

:deep(.dt-actions) {
  opacity: 0;
  display: flex; gap: 3px; flex-shrink: 0;
  transition: opacity 0.1s;
}

:deep(.dt-action-btn) {
  background: #45475a; border: none; border-radius: 3px;
  color: #cdd6f4; cursor: pointer; font-size: 10px;
  padding: 1px 5px; white-space: nowrap; line-height: 1.6;
  &:hover { filter: brightness(1.25); }
}
:deep(.dt-action-btn--test) { background: #2a3a5f; color: #89b4fa; }
:deep(.dt-action-btn--more) { background: #2a2a3a; color: #cba6f7; }
</style>
