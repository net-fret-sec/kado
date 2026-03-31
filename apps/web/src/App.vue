<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import HomeView from './views/HomeView.vue';
import LanguageSwitcher from './components/LanguageSwitcher.vue';
const { t } = useI18n()

</script>

<template>
<div class="container py-4">

  <div class="d-flex justify-content-between align-items-center mb-4  bg-light rounded-3 p-3">
    <div>
      <h1 class="mb-2">{{ t('app.title') }}</h1>
      <p class="lead mb-0">{{ t('app.tagline') }}</p>
    </div>

    <LanguageSwitcher />
  </div>

  <div class="container py-4">
    <router-view />
  </div>
</div>
</template>

<style scoped></style>
