<script setup lang="ts">
import { _dialogState } from '@shared/utils/dialog'

function onConfirm() {
  _dialogState.options?.resolve(true)
  _dialogState.visible = false
}

function onCancel() {
  _dialogState.options?.resolve(false)
  _dialogState.visible = false
}
</script>

<template>
  <Teleport to="body">
    <Transition name="bd-fade">
      <div
        v-if="_dialogState.visible"
        class="bd-overlay"
        @click.self="onCancel"
      >
        <div class="bd-box" role="alertdialog" aria-modal="true">
          <div class="bd-header">
            <span class="bd-title">{{ _dialogState.options?.title }}</span>
          </div>
          <div class="bd-body">
            {{ _dialogState.options?.message }}
          </div>
          <div class="bd-footer">
            <BaseButton
              v-if="_dialogState.options?.type === 'confirm'"
              @click="onCancel"
            >取消</BaseButton>
            <BaseButton variant="primary" @click="onConfirm">确定</BaseButton>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
@use '@shared/styles/tokens' as *;

.bd-overlay {
  position: fixed;
  inset: 0;
  background: $color-overlay;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.bd-box {
  background: $color-surface-0;
  border: 1px solid $color-surface-2;
  border-radius: $radius-lg;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
  width: 380px;
  max-width: 92vw;
  overflow: hidden;
}

.bd-header {
  padding: 14px 16px 0;
}

.bd-title {
  font-weight: 700;
  font-size: 14px;
  color: $color-text;
}

.bd-body {
  padding: 10px 16px 16px;
  font-size: 13px;
  color: $color-text-secondary;
  line-height: 1.6;
}

.bd-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 8px 14px;
  border-top: 1px solid $color-surface-1;
}

// 淡入淡出 + 缩放动画
.bd-fade-enter-active,
.bd-fade-leave-active {
  transition: opacity 0.15s ease;

  .bd-box {
    transition: transform 0.15s ease;
  }
}

.bd-fade-enter-from,
.bd-fade-leave-to {
  opacity: 0;

  .bd-box {
    transform: scale(0.95);
  }
}
</style>
