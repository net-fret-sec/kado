<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { ConflictField, FormValues } from '@/composables/useConflict'
const props = defineProps<{
  fields: ConflictField[]
  choices: Record<string, 'local' | 'remote'>
  ready: boolean
  current: FormValues
}>()
const emit = defineEmits<{ choice: [key: string, value: 'local' | 'remote']; apply: [] }>()
const { t } = useI18n()
function display(value: unknown): string {
  if (value == null || value === '') return t('p2.empty')
  if (typeof value === 'boolean') return t(value ? 'p2.yes' : 'p2.no')
  if (Array.isArray(value))
    return (
      value
        .map((s) =>
          typeof s === 'object' && s
            ? Object.entries(s)
                .filter(([k]) => k !== '_clientId')
                .map(([k, v]) => `${t(`p2.fields.${k}`)}: ${display(v)}`)
                .join(' · ')
            : display(s),
        )
        .join('\n') || t('p2.empty')
    )
  return String(value)
}
</script>
<template>
  <section class="alert alert-warning" role="region" :aria-label="t('p2.conflictTitle')">
    <h3 class="h5">{{ t('p2.conflictTitle') }}</h3>
    <p>{{ t('p2.conflictHelp') }}</p>
    <details class="mb-3">
      <summary>{{ t('p2.currentVersion') }}</summary>
      <dl class="mt-2">
        <template v-for="(value, key) in props.current" :key="key"
          ><dt>{{ t(`p2.fields.${key}`) }}</dt>
          <dd class="conflict-value">{{ display(value) }}</dd></template
        >
      </dl>
    </details>
    <fieldset v-for="field in fields" :key="field.key" class="mb-3">
      <legend class="fs-6 fw-bold">{{ t(`p2.fields.${field.key}`) }}</legend>
      <p>
        {{ t('p2.initialVersion') }}:
        <span class="conflict-value">{{ display(field.initial) }}</span>
      </p>
      <label class="d-block"
        ><input
          type="radio"
          :name="`conflict-${field.key}`"
          :checked="choices[field.key] === 'local'"
          @change="emit('choice', field.key, 'local')"
        />
        {{ t('p2.yourVersion') }}:
        <span class="conflict-value">{{ display(field.local) }}</span></label
      >
      <label class="d-block"
        ><input
          type="radio"
          :name="`conflict-${field.key}`"
          :checked="choices[field.key] === 'remote'"
          @change="emit('choice', field.key, 'remote')"
        />
        {{ t('p2.currentVersion') }}:
        <span class="conflict-value">{{ display(field.remote) }}</span></label
      >
    </fieldset>
    <button type="button" class="btn btn-warning" :disabled="!ready" @click="emit('apply')">
      {{ t('p2.prepareDraft') }}
    </button>
  </section>
</template>
<style scoped>
.conflict-value {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
