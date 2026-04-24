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
  isDrawn: boolean
  isArchived: boolean
  eventDate?: string
  budget?: number
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
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString()
}

function formatBudget() {
  if (!exchange.value || exchange.value.budget == null) return '-'
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(exchange.value.budget)
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
