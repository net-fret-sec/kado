<script setup lang="ts">
import { formatCivilDate } from '@/composables/useCivilDate'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useRefresh } from '@/composables/useRefresh'
import type { ExchangePublicViewDto } from '@kado/shared'
import { useApi, isRequestAborted, HttpError } from '@/composables/useApi'
import { getApiErrorMessage } from '@/composables/useApiErrorMessage'
import { useI18n } from 'vue-i18n'

const route = useRoute()
const api = useApi()
const { t, locale } = useI18n()

const isLoading = ref(true)
const error = ref<string | null>(null)
const exchange = ref<ExchangePublicViewDto | null>(null)

const statusBadgeClass = computed(() => {
  if (!exchange.value) return 'text-bg-light'
  if (exchange.value.isArchived) return 'text-bg-dark'
  if (exchange.value.isDrawn) return 'text-bg-success'
  return 'text-bg-secondary'
})

const statusLabel = computed(() => {
  if (!exchange.value) return '-'
  if (exchange.value.isArchived) return t('exchangeDetail.statusValues.archived')
  if (exchange.value.isDrawn) return t('exchangeDetail.statusValues.drawn')
  return t('exchangeDetail.statusValues.undrawn')
})

function formatDate(value?: string) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString(locale.value)
}

function formatBudget() {
  if (!exchange.value || exchange.value.budget == null) return '-'
  return new Intl.NumberFormat(locale.value, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(exchange.value.budget)
}

const enabled = ref(true)
const refreshState = useRefresh(async (signal) => {
  const id = String(route.params.id)
  try {
    const current = await api.get<ExchangePublicViewDto>(`/api/public/exchanges/${id}`, { signal })
    if (id === route.params.id && !signal.aborted) {
      exchange.value = current
      error.value = null
    }
  } catch (cause) {
    if (id !== route.params.id || signal.aborted || isRequestAborted(cause)) return
    if (cause instanceof HttpError && cause.status === 404) exchange.value = null
    error.value = getApiErrorMessage(cause)
    throw cause
  } finally {
    if (id === route.params.id) isLoading.value = false
  }
}, enabled)
const busy = refreshState.busy,
  paused = refreshState.paused
async function fetchPublicExchange() {
  try {
    await refreshState.refresh()
  } catch {
    /* Inline recovery state. */
  }
}
onMounted(fetchPublicExchange)
watch(
  () => route.params.id,
  () => {
    refreshState.cancel(true)
    exchange.value = null
    isLoading.value = true
    error.value = null
    void fetchPublicExchange()
  },
)
</script>

<template>
  <section id="exchange-public-view">
    <button
      type="button"
      class="btn btn-outline-secondary mb-3"
      :disabled="busy"
      @click="fetchPublicExchange"
    >
      {{ t('p2.refresh') }}
    </button>
    <p v-if="paused" role="status" class="small text-body-secondary">{{ t('p2.refreshPaused') }}</p>
    <div v-if="isLoading" role="status">{{ t('exchangePublic.loading') }}</div>
    <div v-if="error" class="alert alert-danger" role="alert">
      {{ error }} <router-link to="/">{{ t('p2.home') }}</router-link>
    </div>

    <article v-if="exchange && !isLoading" class="card border shadow-sm">
      <div class="card-body">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
          <h1 class="h3 mb-0">{{ exchange.name }}</h1>
          <span class="badge" :class="statusBadgeClass">{{ statusLabel }}</span>
        </div>

        <p class="text-muted" v-if="exchange.description">{{ exchange.description }}</p>

        <dl class="row mb-0">
          <dt class="col-6 col-md-4">{{ t('exchangeDetail.organizer') }}</dt>
          <dd class="col-6 col-md-8">{{ exchange.organizerName || '-' }}</dd>

          <dt class="col-6 col-md-4">{{ t('exchangeDetail.participants') }}</dt>
          <dd class="col-6 col-md-8">{{ exchange.participantsCount }}</dd>

          <dt class="col-6 col-md-4">{{ t('exchangeDetail.exchangeMoment') }}</dt>
          <dd class="col-6 col-md-8">{{ formatCivilDate(exchange.eventDate) }}</dd>

          <dt class="col-6 col-md-4">{{ t('exchangeDetail.budget') }}</dt>
          <dd class="col-6 col-md-8">{{ formatBudget() }}</dd>

          <dt class="col-6 col-md-4">{{ t('exchangeDetail.minWishlistSuggestions') }}</dt>
          <dd class="col-6 col-md-8">{{ exchange.minWishlistSuggestions ?? 0 }}</dd>

          <dt class="col-6 col-md-4">{{ t('exchangePublic.updatedAt') }}</dt>
          <dd class="col-6 col-md-8">{{ formatDate(exchange.updatedAt) }}</dd>
        </dl>

        <div class="mt-3 d-flex flex-wrap gap-2">
          <router-link
            class="btn btn-outline-primary"
            :to="{ name: 'exchange-detail', params: { id: exchange.id } }"
          >
            {{ t('exchangePublic.openAdmin') }}
          </router-link>
        </div>
      </div>
    </article>
  </section>
</template>
