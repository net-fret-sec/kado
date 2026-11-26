<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { LegalDocument, LegalDocumentId } from '@kado/shared'
import { useApi } from '@/composables/useApi'
import { usePageTitle } from '@/composables/usePageTitle'

const props = defineProps<{ document: LegalDocumentId }>()
const { t, locale } = useI18n()
const api = useApi()
const content = ref<LegalDocument | null>(null)
const loading = ref(false)
const failed = ref(false)
const revision = ref(0)
const title = computed(
  () =>
    content.value?.title ??
    (props.document === 'confidentialite' ? t('legal.privacy') : t('legal.terms')),
)
usePageTitle(() => [title.value])
function formatDate(value: string) {
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(`${value}T12:00:00Z`),
  )
}
watch(
  [() => props.document, locale, revision],
  async ([document, language], _previous, onCleanup) => {
    const controller = new AbortController()
    onCleanup(() => controller.abort())
    content.value = null
    loading.value = true
    failed.value = false
    try {
      const result = await api.get<LegalDocument>(
        `/api/legal/${document}?locale=${encodeURIComponent(language)}`,
        { signal: controller.signal },
      )
      if (!controller.signal.aborted) content.value = result
    } catch {
      if (!controller.signal.aborted) failed.value = true
    } finally {
      if (!controller.signal.aborted) loading.value = false
    }
  },
  { immediate: true },
)
</script>

<template>
  <article class="legal-page card mx-auto" :aria-busy="loading">
    <div class="card-body p-3 p-md-4">
      <h1 class="mb-3">{{ title }}</h1>
      <p v-if="loading" role="status">{{ t('legal.loading') }}</p>
      <div v-else-if="failed" role="alert">
        <p>{{ t('legal.unavailable') }}</p>
        <button type="button" class="btn btn-outline-primary" @click="revision++">
          {{ t('legal.retry') }}
        </button>
      </div>
      <template v-else-if="content">
        <p v-if="content.locale !== locale" class="alert alert-info" role="status">
          {{ t('legal.fallback', { language: t(`languages.${content.locale.split('-')[0]}`) }) }}
        </p>
        <p v-if="content.status === 'draft'" class="alert alert-warning">{{ t('legal.draft') }}</p>
        <div class="small text-body-secondary mb-4">
          <p v-if="content.effectiveAt" class="mb-1">
            {{ t('legal.effectiveDate') }}
            <time :datetime="content.effectiveAt">{{ formatDate(content.effectiveAt) }}</time>
          </p>
          <p class="mb-0">
            {{ t('legal.updatedDate') }}
            <time :datetime="content.updatedAt">{{ formatDate(content.updatedAt) }}</time>
          </p>
        </div>
        <!-- Only HTML produced by the API's restricted Markdown renderer. -->
        <div class="legal-body" :lang="content.locale" v-html="content.html"></div>
      </template>
    </div>
  </article>
</template>

<style scoped>
.legal-page {
  max-width: 76ch;
}
.legal-body {
  overflow-wrap: anywhere;
  line-height: 1.7;
}
.legal-body :deep(h2) {
  font-size: var(--step-2);
  margin-block: 1.75rem 1rem;
}
.legal-body :deep(h3) {
  font-size: var(--step-1);
  margin-block: 1.25rem 0.75rem;
}
.legal-body :deep(li + li) {
  margin-top: 0.5rem;
}
.legal-body :deep(table) {
  display: block;
  max-width: 100%;
  overflow-x: auto;
}
.legal-body :deep(th),
.legal-body :deep(td) {
  padding: 0.5rem;
  border: 1px solid var(--bs-border-color);
}
.legal-body :deep(pre) {
  white-space: pre-wrap;
}
</style>
