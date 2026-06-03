import type BaseButton from '@shared/components/BaseButton.vue'
import type BaseModal from '@shared/components/BaseModal.vue'
import type BaseSelect from '@shared/components/BaseSelect.vue'

declare module 'vue' {
  interface GlobalComponents {
    BaseButton: typeof BaseButton
    BaseModal:  typeof BaseModal
    BaseSelect: typeof BaseSelect
  }
}
