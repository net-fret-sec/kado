<script setup lang="ts">
import { useAppStore } from '@/stores/app'

const app = useAppStore()
</script>

<template>
  <main class="container py-4">
    <h1 class="mb-3">{{ app.pageTitle }}</h1>
    <p class="lead">
      Base Vue 3 + Pinia + Bootstrap + TypeScript + PWA.
    </p>

    <button
      type="button"
      class="btn btn-primary"
      @click="app.setLoading(!app.isLoading)"
    >
      Loading: {{ app.isLoading ? 'on' : 'off' }}
    </button>
  </main>
</template>
