import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import BaseButton      from '@shared/components/BaseButton.vue'
import BaseCheckbox    from '@shared/components/BaseCheckbox.vue'
import BaseModal       from '@shared/components/BaseModal.vue'
import BaseSelect      from '@shared/components/BaseSelect.vue'
import BaseDialog      from '@shared/components/BaseDialog.vue'
import BaseNumberInput from '@shared/components/BaseNumberInput.vue'

const app = createApp(App)
app.use(createPinia())
app.component('BaseButton',      BaseButton)
app.component('BaseCheckbox',    BaseCheckbox)
app.component('BaseModal',       BaseModal)
app.component('BaseSelect',      BaseSelect)
app.component('BaseDialog',      BaseDialog)
app.component('BaseNumberInput', BaseNumberInput)
app.mount('#app')
