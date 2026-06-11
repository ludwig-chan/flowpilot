<script setup lang="ts">
import { ref, computed } from 'vue'
import type { FlowStep } from '@shared/types/flow'
import BaseCheckbox from '@shared/components/BaseCheckbox.vue'
import BaseInput from '@shared/components/BaseInput.vue'
import { type VarInfo } from '@shared/utils/varAlias'

const props = defineProps<{
  availableVars: VarInfo[]
  initialStep?: FlowStep | null
}>()

const emit = defineEmits<{
  (e: 'confirm', step: FlowStep): void
  (e: 'cancel'): void
}>()

// 从 initialStep 恢复已选变量（内部名）
const initialFields = computed(() => props.initialStep?.recordFields ?? [])
const selectedVars = ref<string[]>(initialFields.value)
const stepLabel = ref(props.initialStep?.label ?? '保存数据')

// 全选 / 取消全选
const allSelected = computed(() =>
  props.availableVars.length > 0 && selectedVars.value.length === props.availableVars.length
)
function toggleAll() {
  if (allSelected.value) {
    selectedVars.value = []
  } else {
    selectedVars.value = props.availableVars.map(v => v.internal)
  }
}

function toggleVar(internal: string) {
  const idx = selectedVars.value.indexOf(internal)
  if (idx >= 0) selectedVars.value.splice(idx, 1)
  else selectedVars.value.push(internal)
}

/** 根据内部名查找别名 */
function getAlias(internal: string): string {
  const v = props.availableVars.find(av => av.internal === internal)
  return v?.alias ?? internal
}

function confirm() {
  if (!selectedVars.value.length) return
  const step: FlowStep = {
    id:           props.initialStep?.id ?? `step_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    type:         'save_data',
    label:        stepLabel.value.trim() || '保存数据',
    recordFields: selectedVars.value,
  }
  // 保留原有 selector（如果有）
  if (props.initialStep?.selector) step.selector = props.initialStep.selector
  emit('confirm', step)
}
</script>

<template>
  <BaseModal title="💾 保存数据" width="420px" max-height="80vh" :z-index="1200" @close="emit('cancel')">
    <div class="sdm-body">
      <!-- 步骤名称 -->
      <div class="sdm-field">
        <label class="sdm-label">步骤名称</label>
        <BaseInput v-model="stepLabel" placeholder="保存数据" autofocus @keyup.enter="confirm" />
      </div>

      <!-- 变量选择 -->
      <div class="sdm-field">
        <label class="sdm-label">选择要保存的变量</label>
        <div v-if="availableVars.length" class="sdm-vars">
          <div class="sdm-var-row sdm-var-row--header">
            <BaseCheckbox
              :model-value="allSelected"
              @update:model-value="toggleAll"
            />
            <span class="sdm-var-name sdm-var-name--header">全选 / 取消全选</span>
          </div>
          <div v-for="v in availableVars" :key="v.internal" class="sdm-var-row">
            <BaseCheckbox
              :model-value="selectedVars.includes(v.internal)"
              @update:model-value="toggleVar(v.internal)"
            />
            <span class="sdm-var-name">{{ v.alias }}</span>
          </div>
        </div>
        <div v-else class="sdm-empty">
          当前流程中没有可用的变量。<br>
          请先添加「获取文字」或「截图」步骤来创建变量。
        </div>
      </div>

      <!-- 已选摘要 -->
      <div v-if="selectedVars.length" class="sdm-summary">
        将保存 {{ selectedVars.length }} 个变量：
        <code>{{ selectedVars.map(getAlias).join(', ') }}</code>
      </div>
    </div>

    <template #footer>
      <BaseButton @click="emit('cancel')">取消</BaseButton>
      <BaseButton kind="primary" :disabled="!selectedVars.length" @click="confirm">确认</BaseButton>
    </template>
  </BaseModal>
</template>

<style lang="scss" scoped>
.sdm-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 14px;
}

.sdm-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sdm-label {
  font-size: 11px;
  font-weight: 600;
  color: $color-text-muted;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.sdm-vars {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 240px;
  overflow-y: auto;
  border: 1px solid $color-surface-2;
  border-radius: $radius;
  padding: 6px 8px;
  background: $color-surface-1;
}

.sdm-var-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 0;
}

.sdm-var-row--header {
  border-bottom: 1px solid $color-surface-2;
  padding-bottom: 6px;
  margin-bottom: 4px;
}

.sdm-var-name {
  font-size: 12px;
  color: $color-text;
}

.sdm-var-name--header {
  font-size: 11px;
  color: $color-text-muted;
}

.sdm-empty {
  font-size: 12px;
  color: $color-text-muted;
  padding: 12px;
  text-align: center;
  border: 1px solid $color-surface-2;
  border-radius: $radius;
  background: $color-surface-1;
}

.sdm-summary {
  font-size: 11px;
  color: $color-teal;
  padding: 6px 10px;
  background: rgba($color-teal, 0.08);
  border-radius: $radius;
  code {
    font-family: 'Cascadia Code', monospace;
    font-size: 11px;
  }
}
</style>