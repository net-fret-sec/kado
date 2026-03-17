<script setup lang="ts">
import { useAppStore } from '@/stores/app'

const app = useAppStore()
</script>

<template>
  <main class="container py-4">
    <button
      type="button"
      class="btn btn-primary"
      @click="app.setLoading(!app.isLoading)"
    >
      Loading: {{ app.isLoading ? 'on' : 'off' }}
    </button>
  </main>
</template>
