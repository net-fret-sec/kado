<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import LanguageSwitcher from './components/LanguageSwitcher.vue';
import AppToasts from './components/AppToasts.vue';
const { t } = useI18n()

</script>

<template>
<div class="container py-4">

  <div class="d-flex justify-content-between align-items-center mb-4  bg-light rounded-3 p-3">
    <div>
      <h1 class="mb-2"><a href="/">{{ t('app.title') }}</a></h1>
      <p class="lead mb-0">{{ t('app.tagline') }}</p>
    </div>

    <LanguageSwitcher />
  </div>

  <main class="container py-4">
    <router-view />
  </main>

</div>
<AppToasts />
</template>

<style scoped></style>
