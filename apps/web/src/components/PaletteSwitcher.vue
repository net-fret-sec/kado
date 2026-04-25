<script setup lang="ts">
import { usePaletteTheme } from '@/composables/usePaletteTheme'

const { t, currentPaletteTheme } = usePaletteTheme()
</script>

<template>
  <div class="d-inline-block">
    <label class="form-label visually-hidden" for="palette-theme-select">
      {{ t('actions.changePaletteTheme') }}
    </label>

    <select
      id="palette-theme-select"
      v-model="currentPaletteTheme"
      class="form-select-sm"
      style="min-width: 12rem"
    >
      <option value="a">{{ t('palettes.a') }}</option>
      <option value="b">{{ t('palettes.b') }}</option>
      <option value="c">{{ t('palettes.c') }}</option>
      <option value="d">{{ t('palettes.d') }}</option>
      <option value="e">{{ t('palettes.e') }}</option>
      <option value="f">{{ t('palettes.f') }}</option>
      <option value="g">{{ t('palettes.g') }}</option>
      <option value="h">{{ t('palettes.h') }}</option>
      <option value="i">{{ t('palettes.i') }}</option>
      <option value="j">{{ t('palettes.j') }}</option>
    </select>
  </div>
</template>
