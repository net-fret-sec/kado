<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import LanguageSwitcher from './components/LanguageSwitcher.vue';
import AppToasts from './components/AppToasts.vue';
const { t } = useI18n()

</script>

<template>

  <header class="container-flex fapp-header d-flex justify-content-between align-items-center bg-dark">
    <nav class="navbar navbar-dark rounded-3">
      <div class="container-fluid">
        <h1><a class="navbar-brand h2" href="/">{{ t('app.title') }}</a></h1>
      </div>
    </nav>

    <LanguageSwitcher />
  </header>

  <main class="app-main container">
    <router-view />
  </main>

<AppToasts />
</template>
