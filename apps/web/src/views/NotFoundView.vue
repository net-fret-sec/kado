<script setup lang="ts">
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
</script>
<template>
  <section>
    <h1>{{ t('p2.notFoundTitle') }}</h1>
    <p>{{ t('p2.notFoundHelp') }}</p>
    <router-link to="/" class="btn btn-primary">{{ t('p2.home') }}</router-link>
  </section>
</template>
