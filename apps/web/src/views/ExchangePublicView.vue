<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useApi } from '@/composables/useApi'
import { getApiErrorMessage } from '@/composables/useApiErrorMessage'
import { useI18n } from 'vue-i18n'

type ExchangePublicViewDto = {
  id: string
  name: string
  description?: string
  organizerName?: string
  status: 'draft' | 'ready' | 'drawn' | 'archived'
  eventDate?: string
  drawDeadlineAt?: string
  suggestionsDeadlineAt?: string
  budget?: number
  budgetCurrency?: string
  minWishlistSuggestions?: number
  lockSuggestionsAfterDraw?: boolean
  noMutualAssignments?: boolean
  drawAt?: string
  participantsCount: number
  updatedAt: string
}

const route = useRoute()
const api = useApi()
const { t } = useI18n()

const isLoading = ref(true)
const error = ref<string | null>(null)
const exchange = ref<ExchangePublicViewDto | null>(null)

const statusBadgeClass = computed(() => {
  switch (exchange.value?.status) {
    case 'draft':
      return 'text-bg-secondary'
    case 'ready':
      return 'text-bg-info'
    case 'drawn':
      return 'text-bg-success'
    case 'archived':
      return 'text-bg-dark'
    default:
      return 'text-bg-light'
  }
})

const statusLabel = computed(() => {
  switch (exchange.value?.status) {
    case 'draft':
      return t('exchangeDetail.statusValues.draft')
    case 'ready':
      return t('exchangeDetail.statusValues.ready')
    case 'drawn':
      return t('exchangeDetail.statusValues.drawn')
    case 'archived':
      return t('exchangeDetail.statusValues.archived')
    default:
      return '-'
  }
})

function formatDate(value?: string) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString()
}

function formatBudget() {
  if (!exchange.value || exchange.value.budget == null) return '-'
  const currency = exchange.value.budgetCurrency || 'CAD'
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(exchange.value.budget)
}

async function fetchPublicExchange() {
  isLoading.value = true
  error.value = null

  try {
    const id = route.params.id as string
    exchange.value = await api.get<ExchangePublicViewDto>(`/api/public/exchanges/${id}`)
  } catch (err) {
    error.value = getApiErrorMessage(err)
  } finally {
    isLoading.value = false
  }
}

onMounted(fetchPublicExchange)
</script>

<template>
  <section id="exchange-public-view">
    <div v-if="isLoading">{{ t('exchangePublic.loading') }}</div>
    <div v-else-if="error" class="alert alert-danger">{{ error }}</div>

    <article v-else-if="exchange" class="card border shadow-sm">
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
          <dd class="col-6 col-md-8">{{ formatDate(exchange.eventDate) }}</dd>

          <dt class="col-6 col-md-4">{{ t('exchangeDetail.drawDeadlineAt') }}</dt>
          <dd class="col-6 col-md-8">{{ formatDate(exchange.drawDeadlineAt) }}</dd>

          <dt class="col-6 col-md-4">{{ t('exchangeDetail.suggestionsDeadlineAt') }}</dt>
          <dd class="col-6 col-md-8">{{ formatDate(exchange.suggestionsDeadlineAt) }}</dd>

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
