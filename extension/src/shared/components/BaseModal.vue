<script setup lang="ts">
import BaseButton from './BaseButton.vue'

withDefaults(defineProps<{
  title:      string
  width?:     string
  maxHeight?: string
  zIndex?:    number
}>(), {
  width:  '480px',
  zIndex: 1000,
})

const emit = defineEmits<{ (e: 'close'): void }>()
</script>

<template>
  <div
    class="bm-overlay"
    :style="{ zIndex }"
    @click.self="emit('close')"
  >
    <div
      class="bm-modal"
      :style="{ width, maxHeight }"
    >
      <div class="bm-modal__header">
        <span class="bm-modal__title">{{ title }}</span>
        <BaseButton variant="ghost" size="icon" @click="emit('close')">✖</BaseButton>
      </div>
      <slot />
      <div v-if="$slots.footer" class="bm-modal__footer">
        <slot name="footer" />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.bm-overlay {
  position: fixed;
  inset: 0;
  background: $color-overlay;
  display: flex;
  align-items: center;
  justify-content: center;
}

.bm-modal {
  max-width: 92vw;
  background: $color-surface-0;
  border: 1px solid $color-surface-2;
  border-radius: $radius-lg;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  overflow: hidden;

  &__header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border-bottom: 1px solid $color-surface-1;
    flex-shrink: 0;
  }

  &__title {
    font-weight: 700;
    font-size: 14px;
    flex: 1;
    color: $color-text;
  }

  &__footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 8px 14px;
    border-top: 1px solid $color-surface-1;
    flex-shrink: 0;
  }
}
</style>
