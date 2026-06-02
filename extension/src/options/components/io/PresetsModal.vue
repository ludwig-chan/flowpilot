<script setup lang="ts">
import { ref, computed } from 'vue'
import { BUILTIN_PRESETS, type BuiltinPreset } from '@/presets/index'
import BaseModal from '@shared/components/BaseModal.vue'
import BaseInput from '@shared/components/BaseInput.vue'
import BaseButton from '@shared/components/BaseButton.vue'

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
  <BaseModal title="📦 内置预设库" width="520px" max-height="80vh" :z-index="1200" @close="emit('close')">

    <div class="preset-modal__search-row">
      <BaseInput
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
            <BaseButton
              v-if="installedIds.has(preset.id)"
              size="sm"
              disabled
            >✓ 已安装</BaseButton>
            <BaseButton
              v-else
              size="sm"
              variant="primary"
              @click="install(preset)"
            >⬇ 安裃</BaseButton>
          </div>
        </div>
      </template>
    </div>

  </BaseModal>
</template>

<style scoped lang="scss">
.preset-modal__search-row {
  padding: 8px 14px; border-bottom: 1px solid $color-surface-1; flex-shrink: 0;
}

.preset-modal__body {
  flex: 1; overflow-y: auto; padding: 10px 14px;
  display: flex; flex-direction: column; gap: 8px;
}

.preset-modal__empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 10px; padding: 40px 20px; color: $color-text-muted; text-align: center;
}
.preset-modal__empty-icon { font-size: 40px; }
.preset-modal__empty-hint {
  font-size: 12px; color: $color-surface-2; line-height: 1.6;
  code { color: $color-teal; background: $color-base; padding: 1px 4px; border-radius: $radius-sm; }
}

.preset-card {
  display: flex; align-items: flex-start; gap: 12px;
  background: $color-surface-1; border: 1px solid $color-surface-2; border-radius: $radius-md;
  padding: 10px 12px;
  &:hover { border-color: $color-text-muted; }

  &__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
  &__name { font-size: 13px; font-weight: 600; color: $color-text; }
  &__desc { font-size: 12px; color: $color-text-secondary; line-height: 1.4; }
  &__tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px; }
  &__tag {
    font-size: 10px; background: $color-focus-bg; color: $color-blue;
    padding: 1px 6px; border-radius: 99px;
  }
  &__meta { font-size: 11px; color: $color-text-muted; margin-top: 2px; }
  &__actions { flex-shrink: 0; display: flex; align-items: center; }
}
</style>
