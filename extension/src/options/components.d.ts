import type BaseButton   from '@shared/components/BaseButton.vue'
import type BaseCheckbox from '@shared/components/BaseCheckbox.vue'
import type BaseModal    from '@shared/components/BaseModal.vue'
import type BaseSelect   from '@shared/components/BaseSelect.vue'

declare module 'vue' {
  interface GlobalComponents {
    BaseButton:   typeof BaseButton
    BaseCheckbox: typeof BaseCheckbox
    BaseModal:    typeof BaseModal
    BaseSelect:   typeof BaseSelect
  }
}
