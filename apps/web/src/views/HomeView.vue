<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <p>{{ t('app.description') }}</p>
  <router-link to="/exchanges" class="btn btn-secondary">{{ t('home.viewExchanges') }}</router-link>
</template>
