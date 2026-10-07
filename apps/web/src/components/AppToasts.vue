<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useToastsStore } from '@/stores/toasts'

const { t: translate } = useI18n()
const toasts = useToastsStore()
const { items } = storeToRefs(toasts)
</script>

<template>
  <div class="toast-container position-fixed end-0 p-3 pe-none app-toasts">
    <div
      v-for="t in items"
      :key="t.id"
      class="alert mb-2 pe-auto"
      :class="`alert-${t.variant}`"
:role="t.variant === 'danger' ? 'alert' : 'status'"
    >
      <div class="d-flex justify-content-between align-items-start gap-3">
        <div class="flex-grow-1">{{ t.message }}</div>
        <button
          type="button"
          class="btn-close"
          :aria-label="translate('common.close')"
          @click="toasts.remove(t.id)"
        ></button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-toasts {
  top: calc(env(safe-area-inset-top, 0px) + 4.5rem);
  z-index: 1080;
}
</style>
