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

<style lang="scss" src="./styles/app.scss" />
