<script setup lang="ts">
import { ref, computed } from 'vue'
import { BUILTIN_PRESETS, type BuiltinPreset } from '@/presets/index'

const emit = defineEmits<{
  (e: 'install', preset: BuiltinPreset): void
  (e: 'close'): void
}>()

const installedIds = ref(new Set<string>())
const search       = ref('')

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return BUILTIN_PRESETS
  return BUILTIN_PRESETS.filter(p =>
    p.name.toLowerCase().includes(q) ||
    p.description.toLowerCase().includes(q) ||
    p.tags?.some(t => t.toLowerCase().includes(q))
  )
})

function install(preset: BuiltinPreset) {
  emit('install', preset)
  installedIds.value.add(preset.id)
}
</script>

<template>
  <div class="preset-overlay" @click.self="emit('close')">
    <div class="preset-modal">

      <div class="preset-modal__header">
        <span class="preset-modal__title">📦 内置预设库</span>
        <button class="btn btn--ghost btn--icon" @click="emit('close')">✖</button>
      </div>

      <div class="preset-modal__search-row">
        <input
          class="input"
          v-model="search"
          placeholder="搜索预设名称、描述、标签…"
          autofocus
        />
      </div>

      <div class="preset-modal__body">
        <template v-if="BUILTIN_PRESETS.length === 0">
          <div class="preset-modal__empty">
            <div class="preset-modal__empty-icon">📂</div>
            <div>暂无内置预设</div>
            <div class="preset-modal__empty-hint">
              在 <code>src/presets/index.ts</code> 中添加你制作并导出的 <code>.flowpilot</code> 内容即可
            </div>
          </div>
        </template>

        <template v-else-if="filtered.length === 0">
          <div class="preset-modal__empty">
            <div>没有匹配的预设</div>
          </div>
        </template>

        <template v-else>
          <div
            v-for="preset in filtered"
            :key="preset.id"
            class="preset-card"
          >
            <div class="preset-card__body">
              <div class="preset-card__name">{{ preset.name }}</div>
              <div class="preset-card__desc">{{ preset.description }}</div>
              <div v-if="preset.tags?.length" class="preset-card__tags">
                <span v-for="tag in preset.tags" :key="tag" class="preset-card__tag">{{ tag }}</span>
              </div>
              <div class="preset-card__meta">
                {{ preset.payload.nodes.length }} 个节点
              </div>
            </div>
            <div class="preset-card__actions">
              <button
                v-if="installedIds.has(preset.id)"
                class="btn btn--sm"
                disabled
              >✓ 已安装</button>
              <button
                v-else
                class="btn btn--sm btn--primary"
                @click="install(preset)"
              >⬇ 安装</button>
            </div>
          </div>
        </template>
      </div>

    </div>
  </div>
</template>

<style scoped lang="scss">
.preset-overlay {
  position: fixed; inset: 0; z-index: 1200;
  background: rgba(0, 0, 0, .6);
  display: flex; align-items: center; justify-content: center;
}

.preset-modal {
  width: 520px; max-width: 94vw; max-height: 80vh;
  background: #1e1e2e; border: 1px solid #45475a; border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, .5);
  display: flex; flex-direction: column; overflow: hidden;

  &__header {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 14px; border-bottom: 1px solid #313244; flex-shrink: 0;
  }
  &__title { font-weight: 700; font-size: 14px; flex: 1; }

  &__search-row {
    padding: 8px 14px; border-bottom: 1px solid #313244; flex-shrink: 0;
  }

  &__body {
    flex: 1; overflow-y: auto; padding: 10px 14px;
    display: flex; flex-direction: column; gap: 8px;
  }

  &__empty {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 10px; padding: 40px 20px; color: #6c7086; text-align: center;
  }
  &__empty-icon { font-size: 40px; }
  &__empty-hint {
    font-size: 12px; color: #45475a; line-height: 1.6;
    code { color: #89dceb; background: #181825; padding: 1px 4px; border-radius: 3px; }
  }
}

.preset-card {
  display: flex; align-items: flex-start; gap: 12px;
  background: #313244; border: 1px solid #45475a; border-radius: 6px;
  padding: 10px 12px;
  &:hover { border-color: #6c7086; }

  &__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
  &__name { font-size: 13px; font-weight: 600; color: #cdd6f4; }
  &__desc { font-size: 12px; color: #a6adc8; line-height: 1.4; }
  &__tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px; }
  &__tag {
    font-size: 10px; background: #1e3a5f; color: #89b4fa;
    padding: 1px 6px; border-radius: 99px;
  }
  &__meta { font-size: 11px; color: #6c7086; margin-top: 2px; }
  &__actions { flex-shrink: 0; display: flex; align-items: center; }
}
</style>
