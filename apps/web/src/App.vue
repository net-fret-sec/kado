<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { storageUnavailable } from './composables/useStorage'
import LanguageSwitcher from './components/LanguageSwitcher.vue'
import AppToasts from './components/AppToasts.vue'
const { t } = useI18n()
</script>

<template>
  <a href="#main-content" class="skip-link">{{ t('p2.skipContent') }}</a>
  <header class="app-topbar">
    <div class="app-header container-xl d-flex justify-content-between align-items-center">
      <nav class="navbar p-0">
        <h1 class="mb-0">
          <a class="navbar-brand h2" href="/">{{ t('app.title') }}</a>
        </h1>
      </nav>

      <div class="d-flex align-items-center flex-wrap gap-2">
        <LanguageSwitcher />
      </div>
    </div>
  </header>

  <main id="main-content" tabindex="-1" class="app-main container-xl">
    <p v-if="storageUnavailable" class="alert alert-warning" role="status">{{ t('p2.storageUnavailable') }}</p>
    <router-view />
  </main>

  <AppToasts />
</template>
