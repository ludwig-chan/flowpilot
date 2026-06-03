import { ref } from 'vue'
import type { useExtensionBridge } from './useExtensionBridge'

type Bridge = ReturnType<typeof useExtensionBridge>

export function useTabManager(bridge: Bridge) {
  // ── Tab 列表 ──────────────────────────────────────────────────────
  const tabs        = ref<chrome.tabs.Tab[]>([])
  const activeTabId = ref<number | null>(null)

  async function refreshTabs() {
    tabs.value = (await bridge.getTabs()).filter(t => t.url && !t.url.startsWith('chrome'))
    const stillValid = activeTabId.value !== null && tabs.value.some(t => t.id === activeTabId.value)
    if (!stillValid) {
      const active = await bridge.getActiveTab()
      const targetId = (active?.id != null && tabs.value.some(t => t.id === active.id))
        ? active.id
        : (tabs.value[0]?.id ?? null)
      if (targetId !== null) await selectTab(targetId)
    }
  }

  async function selectTab(tabId: number) {
    activeTabId.value = tabId
    await bridge.setActiveTab(tabId)
  }

  // ── Tab 选择拦截（无选中 Tab 时弹窗）────────────────────────────────
  const showTabPickerModal = ref(false)
  const _pending           = ref<(() => void) | null>(null)

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
    tabs, activeTabId,
    refreshTabs, selectTab,
    showTabPickerModal,
    requireTab, onTabPickerConfirm, cancelTabPicker,
  }
}
