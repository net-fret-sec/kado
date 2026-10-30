<script setup lang="ts">
import { useLocale } from '@/composables/useLocale'
import type { AppLocale } from '@/i18n'

const { t, currentLocale, supportedLocales } = useLocale()
const labels: Record<AppLocale, string> = {
  'fr-CA': 'languages.fr',
  'en-CA': 'languages.en',
  es: 'languages.es',
  it: 'languages.it',
  ru: 'languages.ru',
  de: 'languages.de',
}
</script>

<template>
  <div class="d-inline-block">
    <label class="form-label visually-hidden" for="locale-select">
      {{ t('actions.changeLanguage') }}
    </label>

    <select
      id="locale-select"
      v-model="currentLocale"
      class="form-select-sm"
      style="min-width: 10rem"
    >
      <option v-for="language in supportedLocales" :key="language" :value="language">
        {{ t(labels[language]) }}
      </option>
    </select>
  </div>
</template>
