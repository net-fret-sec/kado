<script setup lang="ts">
import { useTheme } from '@/composables/useTheme'

const { t, currentTheme } = useTheme()
</script>

<template>
  <div class="d-inline-block">
    <label class="form-label visually-hidden" for="font-theme-select">
      {{ t('actions.changeFontTheme') }}
    </label>

    <select
      id="font-theme-select"
      v-model="currentTheme"
      class="form-select-sm"
      style="min-width: 12rem"
    >
      <option value="a">{{ t('fonts.a') }}</option>
      <option value="b">{{ t('fonts.b') }}</option>
      <option value="c">{{ t('fonts.c') }}</option>
      <option value="d">{{ t('fonts.d') }}</option>
      <option value="e">{{ t('fonts.e') }}</option>
      <option value="f">{{ t('fonts.f') }}</option>
      <option value="g">{{ t('fonts.g') }}</option>
      <option value="h">{{ t('fonts.h') }}</option>
      <option value="i">{{ t('fonts.i') }}</option>
      <option value="j">{{ t('fonts.j') }}</option>
    </select>
  </div>
</template>
