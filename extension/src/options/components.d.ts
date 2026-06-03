import type BaseButton from '@shared/components/BaseButton.vue'
import type BaseModal from '@shared/components/BaseModal.vue'

declare module 'vue' {
  interface GlobalComponents {
    BaseButton: typeof BaseButton
    BaseModal: typeof BaseModal
  }
}
