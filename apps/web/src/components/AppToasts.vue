<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useToastsStore } from '@/stores/toasts'

const toasts = useToastsStore()
const { items } = storeToRefs(toasts)
</script>

<template>
  <div class="toast-container position-fixed top-0 end-0 p-3 z-3 pe-none">
    <div v-for="t in items" :key="t.id" class="alert mb-2 pe-auto" :class="`alert-${t.variant}`" role="alert">
      <div class="d-flex justify-content-between align-items-start gap-3">
        <div class="flex-grow-1">{{ t.message }}</div>
        <button type="button" class="btn-close" aria-label="Close" @click="toasts.remove(t.id)"></button>
      </div>
    </div>
  </div>
</template>
