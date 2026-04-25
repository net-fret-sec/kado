<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import LanguageSwitcher from './components/LanguageSwitcher.vue'
import ThemeSwitcher from './components/ThemeSwitcher.vue'
import PaletteSwitcher from './components/PaletteSwitcher.vue'
import AppToasts from './components/AppToasts.vue'
const { t } = useI18n()
</script>

<template>
  <header class="app-topbar">
    <div class="app-header container-xl d-flex justify-content-between align-items-center">
      <nav class="navbar p-0">
        <h1 class="mb-0">
          <a class="navbar-brand h2" href="/">{{ t('app.title') }}</a>
        </h1>
      </nav>

      <div class="d-flex align-items-center flex-wrap gap-2">
        <ThemeSwitcher />
        <PaletteSwitcher />
        <LanguageSwitcher />
      </div>
    </div>
  </header>

  <main class="app-main container-xl">
    <router-view />
  </main>

  <AppToasts />
</template>
