<script setup lang="ts">
import { onMounted, computed, watch } from 'vue'
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
const { refreshTabs, requireTab, syncWithFlow, openTabPicker, onTabPickerConfirm: _onTabPickerConfirm, cancelTabPicker } = tabStore

const es = useEditorStore()
const { editingFlow } = storeToRefs(es)

// 切换 flow 时自动同步目标 tab
watch(editingFlow, flow => syncWithFlow(flow?.targetTabId))

// 选完 tab 后同时持久化到当前 flow
async function onTabPickerConfirm(tabId: number) {
  await _onTabPickerConfirm(tabId)
  if (editingFlow.value) {
    await flowStore.update(editingFlow.value.id, { targetTabId: tabId })
  }
}

// 当前目标 tab 的标题（用于 header 显示）
const activeTab = computed(() => tabs.value.find(t => t.id === activeTabId.value) ?? null)

const { logs, running, logDrawerOpen, runCurrentFlow, stopCurrentFlow } = useFlowRunner(bridge, editingFlow)

onMounted(async () => {
  await flowStore.load()
  await refreshTabs()
  await syncWithFlow(editingFlow.value?.targetTabId)
})

const { sidebarWidth, logDrawerHeight, startResize, startLogResize } = useResizable()

</script>

<template>
  <div class="app">
    <header class="app__header">
      <div class="app__logo">⚡ FlowPilot</div>
      <div class="app__tab-status" @click="openTabPicker" title="点击更换目标 Tab">
        <span class="app__tab-status__label">🌐</span>
        <span
          class="app__tab-status__name"
          :class="{ 'app__tab-status__name--empty': !activeTab }"
        >{{ activeTab ? (activeTab.title?.slice(0, 60) ?? activeTab.url) : '点击选择目标 Tab' }}</span>
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

<style lang="scss">
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  background: #1e1e2e;
  color: #cdd6f4;
  font-family: -apple-system, 'Segoe UI', sans-serif;
  font-size: 13px;
  height: 100vh;
  overflow: hidden;
}

.app { display: flex; flex-direction: column; height: 100vh; }
.app__header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: #181825;
  border-bottom: 1px solid #313244;
  flex-shrink: 0;
}
.app__logo { font-weight: 700; font-size: 15px; color: #89b4fa; white-space: nowrap; }
.app__tab-selector { flex: 1; display: flex; align-items: center; gap: 6px; min-width: 0; }
.app__actions { display: flex; gap: 8px; flex-shrink: 0; }
.app__body { display: flex; flex: 1; min-height: 0; }
.app__aside {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: #181825;
  min-width: 180px;
  max-width: 600px;
}
.resize-handle {
  width: 4px;
  flex-shrink: 0;
  background: #313244;
  cursor: col-resize;
  transition: background 0.15s;
  &:hover { background: #89b4fa; }
}
.app__main { flex: 1; overflow-y: auto; padding: 16px; background: #1e1e2e; }
</style>
