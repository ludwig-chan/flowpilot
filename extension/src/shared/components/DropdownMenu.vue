<script setup lang="ts">
import { ref, nextTick, watch, onMounted, onUnmounted } from 'vue'
import BaseButton from './BaseButton.vue'

const props = withDefaults(defineProps<{
  /** 菜单列表相对触发按钮的对齐方式（锚定模式） */
  align?:   'left' | 'right'
  /** 受控模式：外部控制开关（用于浮动模式） */
  open?:    boolean
  /** 浮动模式：触发点的 clientX（传入则启用浮动模式） */
  anchorX?: number
  /** 浮动模式：触发点的 clientY */
  anchorY?: number
}>(), {
  align: 'right',
})

const emit = defineEmits<{
  (e: 'close'): void
}>()

const isOpen    = ref(false)
const placement = ref<'down' | 'up'>('down')
const visible   = ref(true)
const floatPos  = ref({ top: '0px', left: '0px' })

const triggerRef = ref<HTMLElement>()
const listRef    = ref<HTMLElement>()

// ── 受控模式：open / anchorX / anchorY 任一变化时重新定位 ─────────────────
watch(
  [() => props.open, () => props.anchorX, () => props.anchorY],
  async ([openVal]) => {
    if (props.open === undefined) return   // 纯锚定模式，忽略
    if (openVal) {
      await openMenu()
    } else {
      isOpen.value = false
    }
  },
)

async function openMenu() {
  // 先隐藏渲染，测量后再显示，避免位置闪烁
  visible.value   = false
  placement.value = 'down'
  isOpen.value    = true
  await nextTick()

  if (props.anchorX !== undefined && props.anchorY !== undefined && listRef.value) {
    // ── 浮动模式：全方向防溢出 ─────────────────────────────────────────────
    const menuW = listRef.value.offsetWidth
    const menuH = listRef.value.offsetHeight
    const vw    = window.innerWidth
    const vh    = window.innerHeight
    const ax    = props.anchorX
    const ay    = props.anchorY

    // 垂直：优先向下，空间不足则向上翻
    let top: number
    if (ay + menuH > vh - 8) {
      top = Math.max(8, ay - menuH)
      placement.value = 'up'
    } else {
      top = ay
    }
    // 水平：对齐鼠标左侧，clamp 到 [8, vw - menuW - 8]
    let left = Math.min(ax, vw - menuW - 8)
    left = Math.max(8, left)

    floatPos.value = { top: top + 'px', left: left + 'px' }
  } else if (triggerRef.value && listRef.value) {
    // ── 锚定模式：用 getBoundingClientRect 计算 fixed 坐标 ────────────────
    const rect  = triggerRef.value.getBoundingClientRect()
    const menuW = listRef.value.offsetWidth
    const menuH = listRef.value.offsetHeight
    const vw    = window.innerWidth
    const vh    = window.innerHeight

    // 垂直：优先向下，空间不足则向上翻
    let top: number
    if (rect.bottom + menuH + 8 > vh) {
      top = Math.max(8, rect.top - menuH - 4)
      placement.value = 'up'
    } else {
      top = rect.bottom + 4
    }

    // 水平：align=left → 从按钮左边，align=right → 从按钮右边向左展开
    let left = props.align === 'left' ? rect.left : rect.right - menuW
    left = Math.min(Math.max(8, left), vw - menuW - 8)

    floatPos.value = { top: top + 'px', left: left + 'px' }
  }
  visible.value = true
}

async function toggle(e: MouseEvent) {
  e.stopPropagation()
  if (isOpen.value) { close(); return }
  await openMenu()
}

function close() {
  isOpen.value = false
  emit('close')
}

function onDocClick() {
  if (isOpen.value) close()
}

onMounted(()   => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <!-- ── 触发器容器（锚定模式，仅负责 trigger slot） ──────────────────── -->
  <div v-if="anchorX === undefined" class="dm" ref="triggerRef">
    <slot name="trigger" :toggle="toggle" :is-open="isOpen">
      <BaseButton @click="toggle">
        <slot name="label">菜单</slot>
      </BaseButton>
    </slot>
  </div>

  <!-- ── 菜单列表：两种模式统一 Teleport 到 body，fixed 定位 ─────────── -->
  <Teleport to="body">
    <template v-if="isOpen">
      <div class="dm-float-backdrop" @click.stop="close" />
      <div
        ref="listRef"
        class="dm__list"
        :class="`dm__list--${placement}`"
        :style="{ top: floatPos.top, left: floatPos.left, visibility: visible ? 'visible' : 'hidden' }"
        @click.stop
      >
        <slot :close="close" />
      </div>
    </template>
  </Teleport>
</template>

<style lang="scss" scoped>
@use '@shared/styles/tokens' as *;

// ── 锚定模式包装器 ────────────────────────────────────────────────────────
.dm {
  position: relative;
  display: inline-block;
}

// ── 菜单列表（fixed 定位，始终 Teleport 到 body） ────────────────────────
.dm__list {
  position: fixed;
  z-index: 1071;
  background: $color-surface-0;
  border: 1px solid $color-surface-2;
  border-radius: $radius-md;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 160px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);

  &--down {
    animation: dm-down 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    transform-origin: top left;
  }
  &--up {
    animation: dm-up 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    transform-origin: bottom left;
  }
}

@keyframes dm-down {
  from { opacity: 0; transform: translateY(-4px) scale(0.95); }
  to   { opacity: 1; transform: none; }
}
@keyframes dm-up {
  from { opacity: 0; transform: translateY(4px) scale(0.95); }
  to   { opacity: 1; transform: none; }
}
</style>

<!-- 浮动背景遮罩，须脱离 scoped 才能作用于 Teleport 内容 -->
<style lang="scss">
.dm-float-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1070;
}
</style>
