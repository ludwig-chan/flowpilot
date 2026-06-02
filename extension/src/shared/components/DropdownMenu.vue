<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted } from 'vue'
import BaseButton from './BaseButton.vue'

withDefaults(defineProps<{
  /** 菜单列表相对触发按钮的对齐方式 */
  align?: 'left' | 'right'
}>(), {
  align: 'right',
})

const isOpen    = ref(false)
const placement = ref<'down' | 'up'>('down')
const visible   = ref(true)

const triggerRef = ref<HTMLElement>()
const listRef    = ref<HTMLElement>()

async function toggle(e: MouseEvent) {
  e.stopPropagation()
  if (isOpen.value) { isOpen.value = false; return }

  // 先隐藏渲染，测量后再显示，避免位置闪烁
  visible.value   = false
  placement.value = 'down'
  isOpen.value    = true
  await nextTick()

  if (triggerRef.value && listRef.value) {
    const triggerBottom = triggerRef.value.getBoundingClientRect().bottom
    const listHeight    = listRef.value.offsetHeight
    placement.value = (window.innerHeight - triggerBottom < listHeight + 8) ? 'up' : 'down'
  }
  visible.value = true
}

function close() { isOpen.value = false }

function onDocClick() { isOpen.value = false }

onMounted(()   => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <div class="dm" ref="triggerRef">
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
</template>

<style lang="scss" scoped>
@use '@shared/styles/tokens' as *;

.dm {
  position: relative;
  display: inline-block;
}

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

  // 水平对齐
  &--right { right: 0; }
  &--left  { left: 0;  }

  // 垂直方向
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
