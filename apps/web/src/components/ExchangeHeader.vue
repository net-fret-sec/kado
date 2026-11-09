<script setup lang="ts">
defineProps<{ title: string; label?: string; status?: string; statusClass?: string }>()
</script>
<template>
  <header class="exchange-header">
    <div class="d-flex flex-wrap justify-content-between align-items-center gap-3">
      <div class="exchange-header-heading">
        <p v-if="label" class="small text-body-secondary mb-2">{{ label }}</p>
        <div class="d-flex flex-wrap align-items-center gap-2 gap-sm-3">
          <h1 class="h2 mb-0">{{ title }}</h1>
          <span v-if="status" class="badge" :class="statusClass">{{ status }}</span>
        </div>
      </div>
      <div
        v-if="$slots.actions || $slots.tools"
        class="d-flex flex-column align-items-start align-items-sm-end gap-2 mw-100"
      >
        <slot name="actions" />
        <div
          v-if="$slots.tools"
          class="exchange-header-tools d-flex flex-wrap justify-content-start justify-content-sm-end column-gap-2 row-gap-1"
        >
          <slot name="tools" />
        </div>
      </div>
    </div>
    <div v-if="$slots.default" class="exchange-header-message small text-body-secondary mt-3">
      <slot />
    </div>
  </header>
</template>
