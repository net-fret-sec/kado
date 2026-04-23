<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useExchangesStore } from '@/stores/exchanges'
import { useI18n } from 'vue-i18n'
import type { ExchangeDto } from '@kado/shared'
import CreateExchangeModal from '@/components/CreateExchangeModal.vue'

const { t } = useI18n()
const exchangesStore = useExchangesStore()

const isCreateModalOpen = ref(false)
const paletteSwatches = [
  { name: 'Fond global', value: '#F8FAF9', note: 'neutre froid' },
  { name: 'Carte / Surface', value: '#FFFFFF', note: 'blanc pur' },
  { name: 'Surface douce', value: '#F0F2F1', note: 'survols, zébrage' },
  { name: 'Encart beige', value: '#F3EAD8', note: 'zones explicatives' },
  { name: 'Titre / Logo', value: '#1F4E4F', note: 'teal foncé — ancrage' },
  { name: 'Primary', value: '#256665', note: 'actions, liens, focus' },
  { name: 'Sous-texte', value: '#866C5A', note: 'labels, meta' },
  { name: 'Succès', value: '#4C7A5A', note: 'tirage effectué' },
  { name: 'CTA ocre', value: '#D4A94F', note: 'action principale unique' },
  { name: 'CTA hover', value: '#C6922F', note: '' },
  { name: 'Bordure', value: '#E5E7E6', note: 'cartes, séparateurs' },
  { name: 'Bordure beige', value: '#D6CFC4', note: 'encarts beige' },
]

const sortedExchanges = computed(() => {
  return [...exchangesStore.exchanges].sort((a, b) => {
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })
})

function statusBadgeClass(status: ExchangeDto['status']) {
  switch (status) {
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
}

function statusLabel(status: ExchangeDto['status']) {
  return t(`exchanges.statusValues.${status}`)
}

function formatDate(value?: string) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString()
}

function formatBudget(exchange: ExchangeDto) {
  if (exchange.budget == null) return '-'
  const currency = exchange.budgetCurrency || 'CAD'
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(exchange.budget)
}

function participantsCount(exchange: ExchangeDto) {
  return exchange.participants?.length ?? 0
}

onMounted(() => {
  exchangesStore.fetchExchanges()
})
</script>

<template>
  <section id="exchanges-view">
    <h1>{{ t('exchanges.title') }}</h1>

    <button type="button" class="btn btn-primary mb-3" @click="isCreateModalOpen = true">
      {{ t('exchanges.createExchange') }}
    </button>

    <section class="card border shadow-sm mb-4" aria-label="Palette visuelle">
      <div class="card-body">
        <p class="text-uppercase small fw-semibold text-body-secondary mb-2">
          Palette visuelle (brouillon)
        </p>
        <div class="row row-cols-1 row-cols-sm-2 row-cols-xl-3 g-2">
          <div v-for="swatch in paletteSwatches" :key="swatch.name" class="col">
            <div class="border rounded-4 bg-white h-100 p-2 d-flex align-items-start gap-2">
              <span
                class="rounded-circle border flex-shrink-0"
                style="
                  width: 1.2rem;
                  height: 1.2rem;
                  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.06);
                "
                :style="{ backgroundColor: swatch.value }"
                aria-hidden="true"
              ></span>
              <span class="d-flex flex-column gap-1">
                <span class="small fw-semibold text-primary-emphasis lh-sm">{{ swatch.name }}</span>
                <span class="small font-monospace text-body-secondary lh-sm">{{
                  swatch.value
                }}</span>
                <span v-if="swatch.note" class="small fst-italic text-body-secondary lh-sm">{{
                  swatch.note
                }}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <div v-if="exchangesStore.isLoading">{{ t('exchanges.loading') }}</div>
    <div v-else-if="exchangesStore.error">{{ exchangesStore.error }}</div>
    <div v-else-if="!sortedExchanges.length" class="alert alert-light border">
      {{ t('exchanges.empty') }}
    </div>
    <div v-else>
      <div class="row g-3">
        <div v-for="exchange in sortedExchanges" :key="exchange.id" class="col-12 col-lg-6">
          <router-link
            :to="{ name: 'exchange-detail', params: { id: exchange.id } }"
            class="text-decoration-none text-reset"
          >
            <article class="card h-100 border shadow-sm">
              <div class="card-body">
                <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
                  <h5 class="card-title mb-0">{{ exchange.name }}</h5>
                  <span class="badge" :class="statusBadgeClass(exchange.status)">
                    {{ statusLabel(exchange.status) }}
                  </span>
                </div>

                <p class="text-muted mb-3">
                  {{ exchange.description || t('exchanges.noDescription') }}
                </p>

                <dl class="row mb-0 small">
                  <dt class="col-5 text-body-secondary fw-semibold">
                    {{ t('exchanges.organizer') }}
                  </dt>
                  <dd class="col-7 mb-2">{{ exchange.organizerName || '-' }}</dd>

                  <dt class="col-5 text-body-secondary fw-semibold">
                    {{ t('exchanges.participantsCount') }}
                  </dt>
                  <dd class="col-7 mb-2">{{ participantsCount(exchange) }}</dd>

                  <dt class="col-5 text-body-secondary fw-semibold">
                    {{ t('exchanges.exchangeMoment') }}
                  </dt>
                  <dd class="col-7 mb-2">{{ formatDate(exchange.eventDate) }}</dd>

                  <dt class="col-5 text-body-secondary fw-semibold">
                    {{ t('exchanges.drawDeadlineAt') }}
                  </dt>
                  <dd class="col-7 mb-2">{{ formatDate(exchange.drawDeadlineAt) }}</dd>

                  <dt class="col-5 text-body-secondary fw-semibold">{{ t('exchanges.budget') }}</dt>
                  <dd class="col-7 mb-2">{{ formatBudget(exchange) }}</dd>

                  <dt class="col-5 text-body-secondary fw-semibold">
                    {{ t('exchanges.minWishlistSuggestions') }}
                  </dt>
                  <dd class="col-7 mb-2">{{ exchange.minWishlistSuggestions ?? 0 }}</dd>

                  <dt class="col-5 text-body-secondary fw-semibold">
                    {{ t('exchanges.updatedAt') }}
                  </dt>
                  <dd class="col-7 mb-0">{{ formatDate(exchange.updatedAt) }}</dd>
                </dl>
              </div>
            </article>
          </router-link>
        </div>
      </div>
    </div>
  </section>

  <CreateExchangeModal v-model="isCreateModalOpen" />
</template>
