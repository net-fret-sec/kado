<script setup lang="ts">
defineProps<{ title: string; label?: string; status?: string; statusClass?: string }>()
</script>
<template>
  <header class="exchange-header">
    <div class="exchange-header-main">
      <div class="exchange-header-heading">
        <p v-if="label" class="exchange-header-label">{{ label }}</p>
        <div class="d-flex flex-wrap align-items-center gap-2 gap-sm-3">
          <h1 class="h2 mb-0">{{ title }}</h1>
          <span v-if="status" class="badge" :class="statusClass">{{ status }}</span>
        </div>
      </div>
      <div v-if="$slots.actions || $slots.tools" class="exchange-header-actions">
        <slot name="actions" />
        <div v-if="$slots.tools" class="exchange-header-tools"><slot name="tools" /></div>
      </div>
    </div>
    <div v-if="$slots.default" class="exchange-header-message"><slot /></div>
  </header>
</template>
