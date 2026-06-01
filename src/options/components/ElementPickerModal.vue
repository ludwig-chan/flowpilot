<script setup lang="ts">
import ElementPickerDrawer from './ElementPickerDrawer.vue'
import type { SerializedDomNode, SerializedElement } from '@shared/types/dom'

const props = defineProps<{
  domTree:           SerializedDomNode[]
  domFilter:         string
  domScanning:       boolean
  domMutated:        boolean
  domTabTitle:       string
  pickMode:          boolean
  pickedCssSelector: string
}>()

const emit = defineEmits<{
  (e: 'close'):                                       void
  (e: 'scan'):                                        void
  (e: 'togglePick'):                                  void
  (e: 'picked',     el: SerializedElement):           void
  (e: 'testClick',  css: string):                     void
  (e: 'testAction', css: string, actionType: string, value?: string): void
  (e: 'hover',      css: string):                     void
  (e: 'update:domFilter', v: string):                 void
}>()

function onSelect(node: SerializedDomNode) {
  if (!node.item) return
  emit('picked', node.item)
}
</script>

<template>
  <ElementPickerDrawer
    title="🖱 选择元素"
    :dom-tree="domTree"
    :dom-filter="domFilter"
    :dom-scanning="domScanning"
    :dom-mutated="domMutated"
    :dom-tab-title="domTabTitle"
    :pick-mode="pickMode"
    :picked-css-selector="pickedCssSelector"
    @close="emit('close')"
    @scan="emit('scan')"
    @toggle-pick="emit('togglePick')"
    @select="onSelect"
    @test-click="emit('testClick', $event)"
    @test-action="(css: string, type: string, val?: string) => emit('testAction', css, type, val)"
    @hover="emit('hover', $event)"
    @update:dom-filter="emit('update:domFilter', $event)"
  />
</template>


