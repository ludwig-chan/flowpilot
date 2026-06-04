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
    // ── 锚定模式：检测垂直溢出 ────────────────────────────────────────────
    const triggerBottom = triggerRef.value.getBoundingClientRect().bottom
    const listHeight    = listRef.value.offsetHeight
    placement.value = (window.innerHeight - triggerBottom < listHeight + 8) ? 'up' : 'down'
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
  <!-- ── 锚定模式（自带触发按钮，absolute 定位） ───────────────────────── -->
  <div v-if="anchorX === undefined" class="dm" ref="triggerRef">
    <!-- 触发区域：支持外部自定义按钮 -->
    <slot name="trigger" :toggle="toggle" :is-open="isOpen">
      <BaseButton @click="toggle">
        <slot name="label">菜单</slot>
      </BaseButton>
    </slot>

    <!-- 下拉列表 -->
    <div
      v-if="isOpen"
      ref="listRef"
      class="dm__list"
      :class="[
        `dm__list--${placement}`,
        align === 'left' ? 'dm__list--left' : 'dm__list--right',
      ]"
      :style="{ visibility: visible ? 'visible' : 'hidden' }"
      @click.stop
    >
      <slot :close="close" />
    </div>
  </div>

  <!-- ── 浮动模式（受控 open 驱动，Teleport + fixed 定位） ────────────── -->
  <Teleport v-else to="body">
    <template v-if="isOpen">
      <div class="dm-float-backdrop" @click.stop="close" />
      <div
        ref="listRef"
        class="dm__list dm__list--float"
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

// ── 菜单列表（共用基础样式） ─────────────────────────────────────────────
.dm__list {
  position: absolute;
  z-index: 200;
  background: $color-surface-0;
  border: 1px solid $color-surface-2;
  border-radius: $radius-md;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 160px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);

  // 水平对齐（锚定模式）
  &--right { right: 0; }
  &--left  { left: 0;  }

  // 垂直方向（锚定模式）
  &--down {
    top: calc(100% + 4px);
    animation: dm-down 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    transform-origin: top right;
  }
  &--up {
    bottom: calc(100% + 4px);
    animation: dm-up 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    transform-origin: bottom right;
  }

  // 浮动模式：fixed 定位，坐标由 inline style 给定
  &--float {
    position: fixed;
    z-index: 1071;
    animation: dm-down 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    transform-origin: top left;
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
