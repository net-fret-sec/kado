import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { registerSW } from 'virtual:pwa-register'

import App from './App.vue'
import router from './router'
import { i18n, setupI18n } from './i18n'

import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap'

async function bootstrap() {
  const app = createApp(App)

  app.use(createPinia())
  app.use(router)
  app.use(i18n)

  await setupI18n()

  app.mount('#app')

  registerSW({ immediate: true })
}

bootstrap()
