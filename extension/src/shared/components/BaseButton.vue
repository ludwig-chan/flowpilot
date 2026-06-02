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
