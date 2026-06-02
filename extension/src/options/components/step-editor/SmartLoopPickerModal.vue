<script setup lang="ts">
import { ref } from 'vue'
import type { SerializedElement } from '@shared/types/dom'
import type { RepeatingCandidate } from '@shared/types/message'

const props = defineProps<{
  candidates:    RepeatingCandidate[]
  pickedElement: SerializedElement
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
  <div class="slp-overlay" @click.self="emit('cancel')">
    <div class="slp-modal">

      <!-- 标题栏 -->
      <div class="slp-modal__header">
        <span class="slp-modal__title">🔁 智能列表循环</span>
        <button class="btn btn--ghost btn--icon" @click="emit('cancel')">✖</button>
      </div>

      <!-- 已选目标元素 -->
      <div class="slp-section">
        <div class="slp-label">已选目标元素</div>
        <div class="slp-picked">
          <span class="slp-picked__label">{{ pickedElement.label || '（无标签）' }}</span>
          <code class="slp-picked__css" :title="pickedElement.selector.cssSelector">
            {{ pickedElement.selector.cssSelector }}
          </code>
        </div>
      </div>

      <!-- 候选结构列表 -->
      <div class="slp-section slp-section--scroll">
        <div class="slp-label">
          找到 {{ candidates.length }} 种可能的重复结构，请选择要循环的层级：
        </div>

        <div v-if="candidates.length === 0" class="slp-empty">
          未找到可循环的列表结构，请换一个元素重试
        </div>

        <div v-else class="slp-candidates">
          <button
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
              <div class="slp-candidate__rel">
                <template v-if="c.relativeSelector">
                  目标路径：<code>{{ c.relativeSelector }}</code>
                </template>
                <template v-else>
                  <em>目标即为列表项本身</em>
                </template>
              </div>
            </div>

            <span v-if="selectedIdx === idx" class="slp-candidate__check">✓</span>
          </button>
        </div>
      </div>

      <!-- 底部按钮 -->
      <div class="slp-modal__footer">
        <button class="btn" @click="emit('cancel')">取消</button>
        <button
          class="btn btn--primary"
          :disabled="candidates.length === 0"
          @click="onConfirm"
        >确认，循环此结构</button>
      </div>

    </div>
  </div>
</template>

<style lang="scss" scoped>
.slp-overlay {
  position: fixed; inset: 0; z-index: 1070;
  background: rgba(0, 0, 0, .6);
  display: flex; align-items: center; justify-content: center;
}

.slp-modal {
  width: 520px; max-width: 95vw; max-height: 85vh;
  background: #1e1e2e; border: 1px solid #45475a; border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, .5);
  display: flex; flex-direction: column; overflow: hidden;

  &__header {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 14px; border-bottom: 1px solid #313244; flex-shrink: 0;
  }
  &__title { font-weight: 700; font-size: 14px; flex: 1; }
  &__footer {
    display: flex; justify-content: flex-end; gap: 8px;
    padding: 10px 14px; border-top: 1px solid #313244; flex-shrink: 0;
  }
}

.slp-section {
  padding: 10px 14px;
  border-bottom: 1px solid #313244;
  &--scroll { overflow-y: auto; flex: 1; }
}

.slp-label {
  font-size: 11px; color: #6c7086; font-weight: 600; margin-bottom: 8px;
}

.slp-picked {
  display: flex; flex-direction: column; gap: 3px;
  &__label { font-size: 12px; color: #cdd6f4; }
  &__css {
    font-family: 'Cascadia Code', monospace; font-size: 11px; color: #89b4fa;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block;
  }
}

.slp-empty {
  font-size: 12px; color: #585b70; text-align: center; padding: 16px 0;
}

.slp-candidates {
  display: flex; flex-direction: column; gap: 6px;
}

.slp-candidate {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 10px 12px; border-radius: 6px;
  background: #181825; border: 1.5px solid #313244;
  cursor: pointer; text-align: left; width: 100%;
  transition: border-color .12s, background .12s;

  &:hover        { border-color: #fab387; background: rgba(250,179,135,.06); }
  &--active      { border-color: #89b4fa; background: rgba(137,180,250,.08); }
  &--active:hover { border-color: #89b4fa; }

  &__icon { font-size: 18px; flex-shrink: 0; margin-top: 2px; color: #6c7086; }

  &__info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }

  &__main { display: flex; align-items: center; gap: 6px; }
  &__name { font-size: 13px; font-weight: 600; color: #cdd6f4; }
  &__badge {
    font-size: 11px; background: #313244; color: #fab387;
    padding: 1px 7px; border-radius: 10px; flex-shrink: 0;
  }
  &__sel {
    font-family: 'Cascadia Code', monospace; font-size: 10px; color: #a6e3a1;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block;
  }
  &__rel {
    font-size: 11px; color: #6c7086;
    code { font-family: 'Cascadia Code', monospace; font-size: 10px; color: #89b4fa; }
    em   { font-style: italic; }
  }
  &__check { color: #89b4fa; font-weight: 700; flex-shrink: 0; align-self: center; font-size: 14px; }
}
</style>
