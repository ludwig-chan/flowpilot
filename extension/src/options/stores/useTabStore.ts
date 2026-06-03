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

  function init(bridge: Bridge) {
    _bridge = bridge
  }

  async function refreshTabs() {
    if (!_bridge) return
    tabs.value = (await _bridge.getTabs()).filter(t => t.url && !t.url.startsWith('chrome'))
    const stillValid = activeTabId.value !== null && tabs.value.some(t => t.id === activeTabId.value)
    if (!stillValid) {
      const active    = await _bridge.getActiveTab()
      const targetId  = (active?.id != null && tabs.value.some(t => t.id === active.id))
        ? active.id
        : (tabs.value[0]?.id ?? null)
      if (targetId !== null) await selectTab(targetId)
    }
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
    requireTab, onTabPickerConfirm, cancelTabPicker,
  }
})
