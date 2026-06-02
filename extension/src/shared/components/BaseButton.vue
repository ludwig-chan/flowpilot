<script setup lang="ts">
withDefaults(defineProps<{
  variant?: 'primary' | 'danger' | 'ghost'
  size?:    'sm' | 'icon'
  active?:  boolean
  type?:    'button' | 'submit' | 'reset'
}>(), {
  type: 'button',
})
</script>

<template>
  <button
    :type="type"
    :class="[
      'btn',
      variant && `btn--${variant}`,
      size    && `btn--${size}`,
      { 'btn--active': active },
    ]"
  >
    <slot />
  </button>
</template>

<style lang="scss" scoped>
@use '@shared/styles/tokens' as *;

.btn {
  padding: 5px 12px;
  border-radius: $radius;
  border: 1px solid $color-surface-2;
  background: $color-surface-1;
  color: $color-text;
  cursor: pointer;
  font-size: 12px;
  white-space: nowrap;

  &:hover:not(:disabled) { background: $color-surface-2; }
  &:disabled { opacity: 0.4; cursor: default; }
}

.btn--primary {
  background: $color-focus-bg;
  border-color: $color-blue;
  color: $color-blue;
  &:hover:not(:disabled) { background: $color-focus-bg-hover; }
}

.btn--danger {
  background: $color-danger-bg;
  border-color: $color-red;
  color: $color-red;
  &:hover:not(:disabled) { background: $color-danger-bg-hover; }
}

.btn--ghost {
  background: transparent;
  border-color: transparent;
  &:hover:not(:disabled) { background: $color-surface-1; }
}

.btn--sm   { padding: 3px 8px; font-size: 11px; }
.btn--icon { padding: 3px 6px; line-height: 1; }
</style>
