<script setup lang="ts">
import { useTheme } from '@/composables/useTheme'

const { t, currentTheme } = useTheme()
</script>

<template>
  <div class="d-inline-block">
    <label class="form-label visually-hidden" for="theme-select">
      {{ t('actions.changeTheme') }}
    </label>

    <select
      id="theme-select"
      v-model="currentTheme"
      class="form-select-sm"
      style="min-width: 12rem"
    >
      <option value="a">{{ t('themes.a') }}</option>
      <option value="b">{{ t('themes.b') }}</option>
      <option value="c">{{ t('themes.c') }}</option>
      <option value="d">{{ t('themes.d') }}</option>
      <option value="e">{{ t('themes.e') }}</option>
      <option value="f">{{ t('themes.f') }}</option>
      <option value="g">{{ t('themes.g') }}</option>
    </select>
  </div>
</template>
