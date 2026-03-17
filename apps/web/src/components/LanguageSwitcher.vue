<script setup lang="ts">
import { useLocale } from '@/composables/useLocale'

const { t, currentLocale } = useLocale()
</script>

<template>
  <div class="d-inline-block">
    <label class="form-label visually-hidden" for="locale-select">
      {{ t('actions.changeLanguage') }}
    </label>

    <select
      id="locale-select"
      v-model="currentLocale"
      class="form-select"
      style="min-width: 14rem"
    >
      <option value="fr-CA">Français</option>
      <option value="en-CA">English</option>
    </select>

  </div>
</template>
