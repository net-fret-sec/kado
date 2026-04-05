<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import LanguageSwitcher from './components/LanguageSwitcher.vue';
import AppToasts from './components/AppToasts.vue';
const { t } = useI18n()

</script>

<template>
<div class="container app-shell">

  <header class="app-header d-flex justify-content-between align-items-center bg-light rounded-3">
    <nav class="navbar bg-body-tertiary">
      <div class="container-fluid">
        <h1><a class="navbar-brand h2" href="/">{{ t('app.title') }}</a></h1>
        <!-- <p class="lead d-none d-md-block">{{ t('app.tagline') }}</p> -->
      </div>
    </nav>

    <LanguageSwitcher />
  </header>

  <main class="app-main">
    <router-view />
  </main>

</div>
<AppToasts />
</template>
