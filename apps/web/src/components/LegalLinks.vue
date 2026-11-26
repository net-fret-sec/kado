<script setup lang="ts">
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
</script>

<template>
  <nav
    :aria-label="t('legal.navigation')"
    class="legal-links d-flex flex-wrap gap-2 column-gap-4 small mt-3"
  >
    <RouterLink :to="{ name: 'terms' }">{{ t('legal.terms') }}</RouterLink>
    <RouterLink :to="{ name: 'privacy' }">{{ t('legal.privacy') }}</RouterLink>
  </nav>
</template>
