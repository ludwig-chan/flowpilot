<script setup lang="ts">
withDefaults(defineProps<{
  variant?: 'primary' | 'danger' | 'ghost'
  size?:    'sm' | 'icon'
  icon?:    string
  active?:  boolean
  loading?: boolean
  type?:    'button' | 'submit' | 'reset'
}>(), {
  type: 'button',
})
</script>

<template>
  <button
    :type="type"
    :disabled="loading"
    :class="[
      'btn',
      variant && `btn--${variant}`,
      size    && `btn--${size}`,
      { 'btn--active': active },
      { 'btn--loading': loading },
      icon    && 'btn--adaptive',
    ]"
  >
    <template v-if="loading">
      <span class="btn__icon" aria-hidden="true">⏳</span>
      <span class="btn__text"><slot />…</span>
    </template>
    <template v-else-if="icon">
      <span class="btn__icon" aria-hidden="true">{{ icon }}</span>
      <span class="btn__text"><slot /></span>
    </template>
    <template v-else>
      <slot />
    </template>
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

// Adaptive icon/text button
.btn--adaptive {
  .btn__icon { display: none; }
  .btn__text  { display: inline; }
}
</style>
