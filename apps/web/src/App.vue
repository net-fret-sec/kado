<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import LanguageSwitcher from './components/LanguageSwitcher.vue';
import AppToasts from './components/AppToasts.vue';
const { t } = useI18n()

</script>

<template>
<div class="container app-shell">

  <header class="app-header d-flex justify-content-between align-items-center bg-light rounded-3">
    <div>
      <h1 class="mb-2"><a href="/">{{ t('app.title') }}</a></h1>
      <p class="lead mb-0">{{ t('app.tagline') }}</p>
    </div>

    <LanguageSwitcher />
  </header>

  <main class="app-main">
    <router-view />
  </main>

</div>
<AppToasts />
</template>
