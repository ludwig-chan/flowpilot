import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { useExtensionBridge } from '../composables/useExtensionBridge'

type Bridge = ReturnType<typeof useExtensionBridge>

export const useTabStore = defineStore('tab', () => {
  const tabs        = ref<chrome.tabs.Tab[]>([])
  const activeTabId = ref<number | null>(null)

  const showTabPickerModal = ref(false)
  const _pending           = ref<(() => void) | null>(null)

  // Set once by App.vue after bridge is created; not reactive
  let _bridge: Bridge | null = null

  function _onReconnect() {
    if (_bridge && activeTabId.value !== null) {
      _bridge.setActiveTab(activeTabId.value).catch(() => {})
    }
  }

  function init(bridge: Bridge) {
    _bridge = bridge
    bridge.onReconnect(_onReconnect)
  }

  async function refreshTabs() {
    if (!_bridge) return
    tabs.value = (await _bridge.getTabs()).filter(t => t.url && !t.url.startsWith('chrome'))
    // tab 已关闭则清空，不自动猜选（由 syncWithFlow 负责恢复）
    if (activeTabId.value !== null && !tabs.value.some(t => t.id === activeTabId.value)) {
      activeTabId.value = null
    }
  }

  /** 切换 flow 时同步目标 tab：id 仍存活则恢复，否则清空等待用户运行时再选 */
  async function syncWithFlow(targetTabId: number | null | undefined) {
    if (targetTabId != null && tabs.value.some(t => t.id === targetTabId)) {
      await selectTab(targetTabId)
    } else {
      activeTabId.value = null
    }
  }

  /** 手动打开 Tab 选择弹窗（不携带 pending 回调，仅用于更换目标 tab） */
  function openTabPicker() {
    _pending.value           = null
    showTabPickerModal.value = true
  }

  async function selectTab(tabId: number) {
    activeTabId.value = tabId
    await _bridge?.setActiveTab(tabId)
  }

  function requireTab(then: () => void) {
    if (activeTabId.value) { then(); return }
    _pending.value           = then
    showTabPickerModal.value = true
  }

  async function onTabPickerConfirm(tabId: number) {
    await selectTab(tabId)
    showTabPickerModal.value = false
    _pending.value?.()
    _pending.value = null
  }

  function cancelTabPicker() {
    showTabPickerModal.value = false
    _pending.value           = null
  }

  return {
    tabs, activeTabId, showTabPickerModal,
    init,
    refreshTabs, selectTab,
    syncWithFlow, openTabPicker,
    requireTab, onTabPickerConfirm, cancelTabPicker,
  }
})
