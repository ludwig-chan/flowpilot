<script setup lang="ts">
import type { LocalFlow } from '../stores/useFlowStore'
import type { TriggerType, UrlMatchMode } from '@shared/types/flow'

const props = defineProps<{
  flow:          LocalFlow
  estimatedTime: string | null
}>()

const emit = defineEmits<{
  (e: 'save'): void
  (e: 'close'): void
  (e: 'open-settings'): void
}>()

function toggleTrigger() {
  if (props.flow.trigger?.enabled) {
    props.flow.trigger = { ...props.flow.trigger, enabled: false }
  } else {
    props.flow.trigger = {
      enabled:      true,
      type:         props.flow.trigger?.type         ?? 'url_match',
      urlPattern:   props.flow.trigger?.urlPattern   ?? '',
      urlMatchMode: props.flow.trigger?.urlMatchMode ?? 'contains',
      selector:     props.flow.trigger?.selector     ?? '',
      delay:        props.flow.trigger?.delay        ?? 0,
    }
  }
}
</script>

<template>
  <div class="editor__header">
    <div class="editor__header-row">
      <span class="editor__name-display">{{ flow.name }}</span>
      <span v-if="estimatedTime" class="editor__est-time">⏱ {{ estimatedTime }}</span>
      <button class="btn btn--sm" @click="emit('open-settings')">⚙ 设置</button>
      <button class="btn btn--primary" @click="emit('save')">💾 保存</button>
      <button class="btn" @click="emit('close')">✖ 关闭</button>
    </div>
    <!-- 触发器配置 -->
    <div class="editor__delay-row editor__trigger-row">
      <span class="editor__delay-label">触发器：</span>
      <label class="trigger-toggle">
        <input type="checkbox" :checked="flow.trigger?.enabled ?? false" @change="toggleTrigger" />
        自动触发
      </label>
      <template v-if="flow.trigger?.enabled">
        <select
          class="trigger-select"
          :value="flow.trigger.type"
          @change="flow.trigger!.type = ($event.target as HTMLSelectElement).value as TriggerType"
        >
          <option value="url_match">进入网页时</option>
          <option value="element_appear">元素出现时</option>
        </select>
        <template v-if="flow.trigger.type === 'url_match'">
          <select
            class="trigger-select"
            :value="flow.trigger.urlMatchMode ?? 'contains'"
            @change="flow.trigger!.urlMatchMode = ($event.target as HTMLSelectElement).value as UrlMatchMode"
          >
            <option value="contains">URL 包含</option>
            <option value="startsWith">URL 开头为</option>
            <option value="equals">URL 完全相同</option>
            <option value="regex">正则匹配</option>
          </select>
          <input
            class="trigger-input"
            placeholder="例：linkedin.com/jobs"
            :value="flow.trigger.urlPattern ?? ''"
            @input="flow.trigger!.urlPattern = ($event.target as HTMLInputElement).value"
          />
        </template>
        <template v-else-if="flow.trigger.type === 'element_appear'">
          <input
            class="trigger-input trigger-input--wide"
            placeholder="CSS 选择器，例：.captcha-box"
            :value="flow.trigger.selector ?? ''"
            @input="flow.trigger!.selector = ($event.target as HTMLInputElement).value"
          />
          <span class="editor__delay-unit">URL 过滤（可选）：</span>
          <input
            class="trigger-input"
            placeholder="例：example.com"
            :value="flow.trigger.urlPattern ?? ''"
            @input="flow.trigger!.urlPattern = ($event.target as HTMLInputElement).value"
          />
        </template>
        <span class="editor__delay-unit">延迟</span>
        <input
          type="number" min="0" step="500"
          class="editor__delay-custom-input"
          :value="flow.trigger.delay ?? 0"
          @change="flow.trigger!.delay = Number(($event.target as HTMLInputElement).value)"
        />
        <span class="editor__delay-unit">ms 后运行</span>
      </template>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.editor__header { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.editor__header-row { display: flex; align-items: center; gap: 8px; }
.editor__est-time { font-size: 11px; color: #6c7086; margin-right: 4px; }
.editor__name-display { flex: 1; font-size: 14px; font-weight: 600; color: #cdd6f4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.editor__delay-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.editor__delay-label { font-size: 12px; color: #a6adc8; white-space: nowrap; }
.editor__delay-unit { font-size: 12px; color: #a6adc8; }
.editor__delay-custom-input {
  width: 72px; background: #313244; border: 1px solid #45475a; border-radius: 4px;
  color: #cdd6f4; padding: 3px 6px; font-size: 12px; text-align: right;
  &:focus { outline: none; border-color: #89b4fa; }
}
.editor__trigger-row { margin-top: 2px; padding-top: 6px; border-top: 1px solid #313244; }
.trigger-toggle {
  display: flex; align-items: center; gap: 5px; cursor: pointer; font-size: 12px; color: #cdd6f4; white-space: nowrap;
  input[type="checkbox"] { cursor: pointer; accent-color: #89b4fa; width: 14px; height: 14px; }
}
.trigger-select {
  background: #313244; border: 1px solid #45475a; border-radius: 4px;
  color: #cdd6f4; font-size: 12px; padding: 3px 6px; cursor: pointer;
  &:focus { outline: none; border-color: #89b4fa; }
}
.trigger-input {
  background: #181825; border: 1px solid #45475a; border-radius: 4px;
  color: #cdd6f4; font-size: 12px; padding: 3px 8px; min-width: 160px;
  &:focus { outline: none; border-color: #89b4fa; }
  &--wide { min-width: 220px; }
}
</style>
