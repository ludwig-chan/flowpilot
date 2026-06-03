import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import BaseButton from '@shared/components/BaseButton.vue'
import BaseModal from '@shared/components/BaseModal.vue'
import BaseSelect from '@shared/components/BaseSelect.vue'

const app = createApp(App)
app.use(createPinia())
app.component('BaseButton', BaseButton)
app.component('BaseModal', BaseModal)
app.component('BaseSelect', BaseSelect)
app.mount('#app')
