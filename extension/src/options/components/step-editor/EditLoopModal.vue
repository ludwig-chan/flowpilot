<script setup lang="ts">
import { computed } from 'vue'
import type { FlowStep } from '@shared/types/flow'
import RangeInput from '@shared/components/RangeInput.vue'

type OptionalRange = [number | undefined, number | undefined]

const props = defineProps<{
  step: FlowStep
}>()

const emit = defineEmits<{
  (e: 'save',                 step: FlowStep): void
  (e: 'close'):                                void
  (e: 'reselect',             currentState: FlowStep): void
  (e: 'reselect-target',      currentState: FlowStep, actionIdx?: number): void
  (e: 'configure-action',     currentState: FlowStep, actionIdx: number): void
  (e: 'add-call-flow',        currentState: FlowStep): void
}>()

function autoLabel(step: FlowStep): string {
  const selector = step.selector?.cssSelector
  return selector ? `逐项操作列表：${selector.slice(0, 40)}` : '逐项操作列表'
}

function currentState(): FlowStep {
  return {
    ...props.step,
    label:    autoLabel(props.step),
    children: props.step.children ?? [],
    itemActions: normalizedItemActions(),
  }
}

function onSave() {
  emit('save', currentState())
}

function clearItemTarget() {
  props.step.itemTargetSelector = undefined
  props.step.itemTargetRelativeSelector = undefined
  props.step.itemAction = undefined
  props.step.itemActions = []
}

function legacyItemAction(): FlowStep | null {
  if (!props.step.itemAction && !props.step.itemTargetSelector && !props.step.itemTargetRelativeSelector) return null
  return {
    ...(props.step.itemAction ?? {
      id:    `${props.step.id}_item_action`,
      type:  'click',
      label: '点击',
    } as FlowStep),
    selector: props.step.itemAction?.selector ?? props.step.itemTargetSelector,
  }
}

function normalizedItemActions(): FlowStep[] {
  if (props.step.itemActions?.length) return props.step.itemActions
  const legacy = legacyItemAction()
  return legacy ? [legacy] : []
}

const itemActions = computed(() => normalizedItemActions())

function toOptionalRange(range?: [number, number]): OptionalRange {
  return range ? [range[0], range[1]] : [undefined, undefined]
}

function toCompleteRange(range: OptionalRange): [number, number] | undefined {
  if (range[0] === undefined && range[1] === undefined) return undefined
  const min = range[0] ?? range[1] ?? 0
  const max = range[1] ?? range[0] ?? min
  return min <= max ? [min, max] : [max, min]
}

function setItemDelay(range: OptionalRange) {
  props.step.itemDelay = toCompleteRange(range)
}

function setLoopCooldown(range: OptionalRange) {
  props.step.loopCooldown = toCompleteRange(range)
}

function setScrollWait(range: OptionalRange) {
  props.step.scrollWait = toCompleteRange(range)
}

function setMaxLoopItems(value: number | undefined) {
  props.step.maxLoopItems = value && value > 0 ? Math.floor(value) : undefined
}

function setLoopBatchSize(value: number | undefined) {
  props.step.loopBatchSize = value && value > 0 ? Math.floor(value) : undefined
}

function setLoopStopSelector(value: string) {
  props.step.loopStopSelector = value.trim() || undefined
}

function ensureItemActions(): FlowStep[] {
  if (!props.step.itemActions) props.step.itemActions = normalizedItemActions()
  props.step.itemAction = undefined
  props.step.itemTargetSelector = undefined
  props.step.itemTargetRelativeSelector = undefined
  return props.step.itemActions
}

function actionTargetLabel(action: FlowStep): string {
  if (action.type === 'call_flow') return '嵌入流程'
  return action.selector?.relativeSelector || action.selector?.cssSelector || '默认整项'
}

function actionLabel(action: FlowStep): string {
  return action.label || action.type
}

function addItemAction() {
  const idx = ensureItemActions().length
  emit('reselect-target', currentState(), idx)
}

function removeItemAction(idx: number) {
  ensureItemActions().splice(idx, 1)
}

function moveItemAction(idx: number, offset: -1 | 1) {
  const actions = ensureItemActions()
  const nextIdx = idx + offset
  if (nextIdx < 0 || nextIdx >= actions.length) return
  const [item] = actions.splice(idx, 1)
  actions.splice(nextIdx, 0, item)
}

function reselectItemActionTarget(idx: number) {
  ensureItemActions()
  emit('reselect-target', currentState(), idx)
}

function configureItemAction(idx: number) {
  ensureItemActions()
  emit('configure-action', currentState(), idx)
}
</script>

<template>
  <BaseModal title="编辑选择列表" width="680px" :z-index="1070" @close="emit('close')">
    <div class="elm-section">
      <label class="elm-label">选择列表</label>
      <div class="elm-selector-row">
        <code class="elm-selector-val" :title="step.selector?.cssSelector">
          {{ step.selector?.cssSelector || '（未设置）' }}
        </code>
        <BaseButton class="elm-resel-btn" @click="emit('reselect', currentState())">重新选择</BaseButton>
      </div>
    </div>

    <div class="elm-section">
      <label class="elm-label">项内目标与动作</label>
      <div v-if="itemActions.length" class="elm-action-list">
        <div v-for="(action, idx) in itemActions" :key="action.id || idx" class="elm-item-row">
          <div class="elm-inline-field elm-inline-field--target">
            <span class="elm-inline-label">目标 {{ idx + 1 }}</span>
            <code class="elm-selector-val" :title="actionTargetLabel(action)">
              {{ actionTargetLabel(action) }}
            </code>
            <BaseButton
              v-if="action.type !== 'call_flow'"
              class="elm-resel-btn"
              :disabled="!step.selector?.cssSelector"
              @click="reselectItemActionTarget(idx)"
            >选元素</BaseButton>
          </div>
          <div class="elm-inline-field elm-inline-field--action">
            <span class="elm-inline-label">动作</span>
            <code class="elm-action-val" :title="actionLabel(action)">
              {{ actionLabel(action) }}
            </code>
            <BaseButton
              v-if="action.type !== 'call_flow'"
              class="elm-resel-btn"
              @click="configureItemAction(idx)"
            >选择动作</BaseButton>
            <BaseButton
              class="elm-resel-btn"
              :disabled="idx === 0"
              @click="moveItemAction(idx, -1)"
            >上移</BaseButton>
            <BaseButton
              class="elm-resel-btn"
              :disabled="idx === itemActions.length - 1"
              @click="moveItemAction(idx, 1)"
            >下移</BaseButton>
            <BaseButton
              class="elm-resel-btn"
              @click="removeItemAction(idx)"
            >删除</BaseButton>
          </div>
        </div>
      </div>
      <div v-else class="elm-empty-actions">
        <span>尚未配置项内动作，默认点击整项。</span>
      </div>
      <div class="elm-action-toolbar">
        <BaseButton
          class="elm-resel-btn"
          :disabled="!step.selector?.cssSelector"
          @click="addItemAction"
        >添加项内动作</BaseButton>
        <BaseButton
          class="elm-resel-btn"
          @click="emit('add-call-flow', currentState())"
        >添加嵌入流程</BaseButton>
        <BaseButton
          v-if="itemActions.length"
          class="elm-resel-btn"
          @click="clearItemTarget"
        >清空动作</BaseButton>
      </div>
      <p class="elm-hint">每一项会按上面的顺序执行：例如先点头像，再执行流程 A，再点昵称，然后进入下一项。</p>
    </div>

    <div class="elm-section">
      <label class="elm-label">执行节奏</label>
      <div class="elm-settings-grid">
        <div class="elm-setting-row">
          <span class="elm-setting-label">最多处理</span>
          <BaseNumberInput
            min="1"
            step="1"
            style="width: 78px"
            :modelValue="step.maxLoopItems"
            @update:modelValue="setMaxLoopItems"
          />
          <span class="elm-setting-unit">项</span>
        </div>
        <div class="elm-setting-row">
          <span class="elm-setting-label">每批数量</span>
          <BaseNumberInput
            min="1"
            step="1"
            style="width: 78px"
            :modelValue="step.loopBatchSize"
            @update:modelValue="setLoopBatchSize"
          />
          <span class="elm-setting-unit">项</span>
        </div>
        <div class="elm-setting-row elm-setting-row--wide">
          <span class="elm-setting-label">每项延迟</span>
          <RangeInput
            :model-value="toOptionalRange(step.itemDelay)"
            :allow-empty="true"
            placeholder-min="最小"
            placeholder-max="最大"
            @update:model-value="setItemDelay"
          />
        </div>
        <div class="elm-setting-row elm-setting-row--wide">
          <span class="elm-setting-label">批间冷却</span>
          <RangeInput
            :model-value="toOptionalRange(step.loopCooldown)"
            :allow-empty="true"
            placeholder-min="最小"
            placeholder-max="最大"
            @update:model-value="setLoopCooldown"
          />
        </div>
        <div class="elm-setting-row elm-setting-row--wide">
          <span class="elm-setting-label">滚动等待</span>
          <RangeInput
            :model-value="toOptionalRange(step.scrollWait)"
            :allow-empty="true"
            placeholder-min="最小"
            placeholder-max="最大"
            @update:model-value="setScrollWait"
          />
        </div>
        <div class="elm-setting-row">
          <span class="elm-setting-label">滚动方式</span>
          <select
            class="elm-select"
            :value="step.scrollBehavior ?? 'none'"
            @change="step.scrollBehavior = ($event.target as HTMLSelectElement).value as FlowStep['scrollBehavior']"
          >
            <option value="none">不额外滚动</option>
            <option value="item">滚到当前项</option>
            <option value="bottom">滚到底部</option>
          </select>
        </div>
        <div class="elm-setting-row elm-setting-row--full">
          <span class="elm-setting-label">停止选择器</span>
          <BaseInput
            class="elm-stop-input"
            :modelValue="step.loopStopSelector ?? ''"
            placeholder="例：.captcha, .login-modal, .rate-limit-tip"
            @update:modelValue="setLoopStopSelector"
          />
        </div>
      </div>
      <p class="elm-hint">命中停止选择器时会立即停止循环，适合填写验证码、登录弹窗或频率提示元素。</p>
    </div>

    <template #footer>
      <BaseButton @click="emit('close')">取消</BaseButton>
      <BaseButton kind="primary" @click="onSave">保存</BaseButton>
    </template>
  </BaseModal>
</template>

<style lang="scss" scoped>
.elm-section {
  padding: 14px;
  border-bottom: 1px solid #1a1a28;
}

.elm-label {
  display: block;
  font-size: 11px;
  color: $color-text-muted;
  margin-bottom: 8px;
  font-weight: 600;
}

.elm-selector-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.elm-item-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(210px, 0.52fr);
  gap: 10px;
  align-items: center;
}

.elm-action-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.elm-empty-actions {
  padding: 8px 10px;
  border: 1px dashed #45475a;
  border-radius: 6px;
  color: $color-text-muted;
  font-size: 11px;
}

.elm-action-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

.elm-settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.elm-setting-row {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.elm-setting-row--wide,
.elm-setting-row--full {
  grid-column: 1 / -1;
}

.elm-setting-label {
  flex-shrink: 0;
  width: 64px;
  font-size: 11px;
  color: $color-text-muted;
  font-weight: 600;
}

.elm-setting-unit {
  font-size: 11px;
  color: $color-text-muted;
}

.elm-select {
  min-width: 126px;
  background: $color-surface-1;
  border: 1px solid $color-surface-2;
  border-radius: $radius;
  color: $color-text;
  font-size: 12px;
  padding: 4px 8px;
}

.elm-stop-input {
  flex: 1;
  min-width: 0;
}

.elm-inline-field {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.elm-inline-field--action {
  padding-left: 10px;
  border-left: 1px solid #313244;
}

.elm-inline-label {
  flex-shrink: 0;
  font-size: 11px;
  color: $color-text-muted;
  font-weight: 600;
}

.elm-selector-val {
  flex: 1;
  min-width: 0;
  font-family: 'Cascadia Code', monospace;
  font-size: 11px;
  color: $color-green;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.elm-action-val {
  flex: 1;
  min-width: 64px;
  font-family: 'Cascadia Code', monospace;
  font-size: 11px;
  color: $color-green;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.elm-hint {
  margin: 8px 0 0;
  font-size: 11px;
  color: $color-text-muted;
  line-height: 1.5;
}

.elm-resel-btn {
  font-size: 11px;
  padding: 3px 10px;
  flex-shrink: 0;
}

@media (max-width: 620px) {
  .elm-item-row {
    grid-template-columns: 1fr;
  }

  .elm-inline-field--action {
    padding-left: 0;
    border-left: 0;
  }

  .elm-settings-grid {
    grid-template-columns: 1fr;
  }
}
</style>
