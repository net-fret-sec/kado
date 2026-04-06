<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import LanguageSwitcher from './components/LanguageSwitcher.vue'
import AppToasts from './components/AppToasts.vue'
const { t } = useI18n()
</script>

<template>
  <header class="bg-dark">
    <div class="app-header container d-flex justify-content-between align-items-center">
      <nav class="navbar navbar-dark">
        <h1>
          <a class="navbar-brand h2" href="/">{{ t('app.title') }}</a>
        </h1>
      </nav>

      <LanguageSwitcher />
    </div>
  </header>

  <main class="app-main container">
    <router-view />
  </main>

  <AppToasts />
</template>
