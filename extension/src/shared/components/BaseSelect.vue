<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'

export interface SelectOption {
  value:     string | number
  label:     string
  disabled?: boolean
}

const props = withDefaults(defineProps<{
  modelValue:   string | number | null
  options:      SelectOption[]
  placeholder?: string
  disabled?:    boolean
}>(), {
  placeholder: '请选择…',
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | number): void
}>()

const isOpen     = ref(false)
const placement  = ref<'down' | 'up'>('down')
const visible    = ref(true)
const triggerRef = ref<HTMLElement>()
const listRef    = ref<HTMLElement>()

const selectedLabel = computed(() =>
  props.options.find(o => o.value === props.modelValue)?.label ?? null
)

async function toggle(e: MouseEvent) {
  e.stopPropagation()
  if (props.disabled) return
  if (isOpen.value) { isOpen.value = false; return }

  visible.value   = false
  placement.value = 'down'
  isOpen.value    = true
  await nextTick()

  if (triggerRef.value && listRef.value) {
    const rect  = triggerRef.value.getBoundingClientRect()
    const listH = listRef.value.offsetHeight
    placement.value = (window.innerHeight - rect.bottom < listH + 8) ? 'up' : 'down'
  }
  visible.value = true
}

function select(opt: SelectOption) {
  if (opt.disabled) return
  emit('update:modelValue', opt.value)
  isOpen.value = false
}

function onDocClick() { isOpen.value = false }

onMounted(()   => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <div ref="triggerRef" class="bsel" :class="{ 'bsel--open': isOpen, 'bsel--disabled': disabled }">
    <button type="button" class="bsel__trigger" @click="toggle">
      <span class="bsel__value" :class="{ 'bsel__value--placeholder': !selectedLabel }">
        {{ selectedLabel ?? placeholder }}
      </span>
      <span class="bsel__arrow" :class="{ 'bsel__arrow--up': isOpen }">▾</span>
    </button>

    <div
      v-if="isOpen"
      ref="listRef"
      class="bsel__list"
      :class="[`bsel__list--${placement}`]"
      :style="{ visibility: visible ? 'visible' : 'hidden' }"
      @click.stop
    >
      <button
        v-for="opt in options"
        :key="opt.value"
        type="button"
        class="bsel__item"
        :class="{
          'bsel__item--selected': opt.value === modelValue,
          'bsel__item--disabled': opt.disabled,
        }"
        @click="select(opt)"
      >
        <span class="bsel__item-label">{{ opt.label }}</span>
        <span v-if="opt.value === modelValue" class="bsel__item-check">✓</span>
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '@shared/styles/tokens' as *;

.bsel {
  position: relative;
  display: flex;
  flex: 1;
  min-width: 0;

  &--disabled { opacity: 0.4; pointer-events: none; }
}

.bsel__trigger {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  background: $color-surface-1;
  border: 1px solid $color-surface-2;
  border-radius: $radius;
  color: $color-text;
  padding: 5px 8px;
  font-size: 12px;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s;

  .bsel--open & { border-color: $color-blue; }
  &:hover { border-color: $color-surface-3; }
  &:focus { outline: none; border-color: $color-blue; }
}

.bsel__value {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &--placeholder { color: $color-text-muted; }
}

.bsel__arrow {
  flex-shrink: 0;
  font-size: 11px;
  color: $color-text-muted;
  transition: transform 0.15s;
  line-height: 1;

  &--up { transform: rotate(180deg); }
}

.bsel__list {
  position: absolute;
  left: 0;
  right: 0;
  z-index: $z-modal;
  background: $color-surface-0;
  border: 1px solid $color-surface-2;
  border-radius: $radius-md;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 240px;
  overflow-y: auto;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);

  &--down {
    top: calc(100% + 4px);
    animation: bsel-down 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    transform-origin: top center;
  }
  &--up {
    bottom: calc(100% + 4px);
    animation: bsel-up 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    transform-origin: bottom center;
  }
}

.bsel__item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: $radius;
  cursor: pointer;
  font-size: 12px;
  color: $color-text;
  background: none;
  border: none;
  text-align: left;
  width: 100%;
  transition: background 0.1s;

  &:hover:not(.bsel__item--disabled) { background: $color-surface-1; }

  &--selected {
    color: $color-blue;
    background: $color-focus-bg;
    &:hover { background: $color-focus-bg-hover; }
  }

  &--disabled { opacity: 0.4; cursor: default; }
}

.bsel__item-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bsel__item-check {
  flex-shrink: 0;
  font-size: 11px;
  color: $color-blue;
}

@keyframes bsel-down {
  from { opacity: 0; transform: translateY(-4px) scale(0.97); }
  to   { opacity: 1; transform: none; }
}

@keyframes bsel-up {
  from { opacity: 0; transform: translateY(4px) scale(0.97); }
  to   { opacity: 1; transform: none; }
}
</style>
