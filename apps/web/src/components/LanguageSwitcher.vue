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
      class=" form-select-sm"
      style="min-width: 10rem"
    >
      <option value="fr-CA">{{ t('languages.fr') }}</option>
      <option value="en-CA">{{ t('languages.en') }}</option>
    </select>

  </div>
</template>
