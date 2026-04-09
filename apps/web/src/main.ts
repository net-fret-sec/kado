import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { registerSW } from 'virtual:pwa-register'

import App from './App.vue'
import router from './router'
import { i18n, setupI18n } from './i18n'

import '@fontsource/source-sans-3/latin-ext-400.css'
import '@fontsource/source-sans-3/latin-ext-600.css'
import '@fontsource/source-sans-3/latin-ext-700.css'
import './styles/main.scss'
import 'bootstrap'
import 'bootstrap-icons/font/bootstrap-icons.css'

async function bootstrap() {
  if (import.meta.env.DEV && 'serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((registration) => registration.unregister()))
  }

  const app = createApp(App)

  app.use(createPinia())
  app.use(router)
  app.use(i18n)

  await setupI18n()

  app.mount('#app')

  if (import.meta.env.PROD) {
    registerSW({ immediate: true })
  }
}

bootstrap()
