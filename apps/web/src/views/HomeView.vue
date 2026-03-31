<script setup lang="ts">
import { useAppStore } from '@/stores/app'

const app = useAppStore()
</script>

<template>
  <main class="container py-4">
    <!-- Bouton de test supprimé -->
    <router-link to="/exchanges" class="btn btn-secondary">View Exchanges</router-link>
  </main>
</template>
