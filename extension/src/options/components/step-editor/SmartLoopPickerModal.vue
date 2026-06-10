<script setup lang="ts">
import { ref } from 'vue'
import type { RepeatingCandidate } from '@shared/types/message'

const props = defineProps<{
  candidates: RepeatingCandidate[]
}>()

const emit = defineEmits<{
  (e: 'confirm',         candidate: RepeatingCandidate): void
  (e: 'cancel'):                                         void
  (e: 'hover-candidate', selector: string):              void
  (e: 'leave-candidate'):                                void
}>()

const selectedIdx = ref(0)

function onConfirm() {
  if (props.candidates.length === 0) return
  emit('confirm', props.candidates[selectedIdx.value])
}

const TAG_ICONS: Record<string, string> = {
  TR: '⊞', LI: '☰', TD: '▣', TH: '▤', OPTION: '▾',
}
function tagIcon(tagName: string): string {
  return TAG_ICONS[tagName] ?? '◻'
}
</script>

<template>
  <BaseModal title="🔁 选择列表" width="520px" max-height="85vh" :z-index="1070" @close="emit('cancel')">
      <!-- 候选结构列表 -->
      <div class="slp-section slp-section--scroll">
        <div class="slp-label">
          找到 {{ candidates.length }} 种可能的列表结构：
        </div>

        <div v-if="candidates.length === 0" class="slp-empty">
          未找到可循环的列表结构，请换一个元素重试
        </div>

        <div v-else class="slp-candidates">
          <BaseButton
            v-for="(c, idx) in candidates"
            :key="idx"
            class="slp-candidate"
            :class="{ 'slp-candidate--active': selectedIdx === idx }"
            @click="selectedIdx = idx"
            @mouseenter="emit('hover-candidate', c.itemSelector)"
            @mouseleave="emit('leave-candidate')"
          >
            <span class="slp-candidate__icon">{{ tagIcon(c.tagName) }}</span>

            <div class="slp-candidate__info">
              <div class="slp-candidate__main">
                <span class="slp-candidate__name">{{ c.inferredLabel }}</span>
                <span class="slp-candidate__badge">共 {{ c.count }} 项</span>
              </div>
              <code class="slp-candidate__sel" :title="c.itemSelector">{{ c.itemSelector }}</code>
            </div>

            <span v-if="selectedIdx === idx" class="slp-candidate__check">✓</span>
          </BaseButton>
        </div>
      </div>

      <!-- 底部按钮 -->
      <template #footer>
        <BaseButton @click="emit('cancel')">取消</BaseButton>
        <BaseButton
          kind="primary"
          :disabled="candidates.length === 0"
          @click="onConfirm"
        >确认选择</BaseButton>
      </template>

  </BaseModal>
</template>

<style lang="scss" scoped>
.slp-section {
  padding: 10px 14px;
  border-bottom: 1px solid $color-surface-1;
  &--scroll { overflow-y: auto; flex: 1; }
}

.slp-label {
  font-size: 11px; color: $color-text-muted; font-weight: 600; margin-bottom: 8px;
}

.slp-empty {
  font-size: 12px; color: $color-text-muted-2; text-align: center; padding: 16px 0;
}

.slp-candidates {
  display: flex; flex-direction: column; gap: 6px;
}

.slp-candidate {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 10px 12px; border-radius: $radius-md;
  background: $color-base; border: 1.5px solid $color-surface-1;
  cursor: pointer; text-align: left; width: 100%;
  transition: border-color .12s, background .12s;

  &:hover        { border-color: $color-orange; background: rgba(250,179,135,.06); }
  &--active      { border-color: $color-blue; background: rgba(137,180,250,.08); }
  &--active:hover { border-color: $color-blue; }

  &__icon { font-size: 18px; flex-shrink: 0; margin-top: 2px; color: $color-text-muted; }

  &__info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }

  &__main { display: flex; align-items: center; gap: 6px; }
  &__name { font-size: 13px; font-weight: 600; color: $color-text; }
  &__badge {
    font-size: 11px; background: $color-surface-1; color: $color-orange;
    padding: 1px 7px; border-radius: 10px; flex-shrink: 0;
  }
  &__sel {
    font-family: 'Cascadia Code', monospace; font-size: 10px; color: $color-green;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block;
  }
  &__check { color: $color-blue; font-weight: 700; flex-shrink: 0; align-self: center; font-size: 14px; }
}
</style>
