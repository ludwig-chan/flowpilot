import { inject } from 'vue'
import type { useExtensionBridge } from './useExtensionBridge'

export type Bridge = ReturnType<typeof useExtensionBridge>

export function useBridge(): Bridge {
  return inject<Bridge>('bridge')!
}
