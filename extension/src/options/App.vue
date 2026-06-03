<script setup lang="ts">
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useFlowStore } from './stores/useFlowStore'
import { useExtensionBridge } from './composables/useExtensionBridge'
import { useFlowRunner } from './composables/useFlowRunner'
import { useResizable } from './composables/useResizable'
import { useEditorStore } from './stores/useEditorStore'
import { useTabStore } from './stores/useTabStore'
import LogDrawer from './components/layout/LogDrawer.vue'
import TabPickerModal from './components/layout/TabPickerModal.vue'
import FlowSidebar from './components/layout/FlowSidebar.vue'
import StepList from './components/layout/StepList.vue'

const flowStore = useFlowStore()
const bridge    = useExtensionBridge()

const tabStore = useTabStore()
tabStore.init(bridge)
const { tabs, activeTabId, showTabPickerModal } = storeToRefs(tabStore)
const { refreshTabs, selectTab, requireTab, onTabPickerConfirm, cancelTabPicker } = tabStore

const es = useEditorStore()
const { editingFlow } = storeToRefs(es)

const { logs, running, logDrawerOpen, runCurrentFlow, stopCurrentFlow } = useFlowRunner(bridge, editingFlow)

onMounted(async () => {
  await flowStore.load()
  await refreshTabs()
})

const { sidebarWidth, logDrawerHeight, startResize, startLogResize } = useResizable()

</script>

<template>
  <div class="app">
    <header class="app__header">
      <div class="app__logo">⚡ FlowPilot</div>
      <div class="app__tab-selector">
        <select class="tab-select" :value="activeTabId ?? ''"
          @change="e => selectTab(Number((e.target as HTMLSelectElement).value))">
          <option value="" disabled>选择目标 Tab…</option>
          <option v-for="tab in tabs" :key="tab.id" :value="tab.id">{{ tab.title?.slice(0, 60) ?? tab.url }}</option>
        </select>
        <BaseButton variant="ghost" @click="refreshTabs">↻</BaseButton>
      </div>

    </header>

    <div class="app__body">
      <aside class="app__aside" :style="{ width: sidebarWidth + 'px' }">
        <FlowSidebar />
      </aside>

      <div class="resize-handle" @mousedown="startResize"></div>

      <main class="app__main">
        <StepList
          :bridge="bridge"
          :running="running"
          @run="requireTab(runCurrentFlow)"
          @stop="stopCurrentFlow()"
        />
      </main>
    </div>

    <!-- 底部全局日志抽屉 -->
    <LogDrawer
      v-model:open="logDrawerOpen"
      :logs="logs"
      :running="running"
      :log-drawer-height="logDrawerHeight"
      :start-log-resize="startLogResize"
      @update:logs="logs = $event"
    />

    <!-- Tab 选择弹窗（在没有选中 tab 时就地拦截） -->
    <TabPickerModal
      v-if="showTabPickerModal"
      :tabs="tabs"
      @confirm="onTabPickerConfirm"
      @cancel="cancelTabPicker"
    />

  </div>

</template>

<style lang="scss" src="./styles/app.scss" />
