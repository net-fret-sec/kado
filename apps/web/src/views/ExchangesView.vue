<script setup lang="ts">
import { formatMoney } from '@/composables/useCurrency'
import { formatCivilDate } from '@/composables/useCivilDate'
import { ref, onMounted, computed } from 'vue'
import { useExchangesStore } from '@/stores/exchanges'
import { useI18n } from 'vue-i18n'
import type { ExchangeDto } from '@kado/shared'
import CreateExchangeModal from '@/components/CreateExchangeModal.vue'

const { t, locale } = useI18n()
const exchangesStore = useExchangesStore()

const isCreateModalOpen = ref(false)
const paletteSwatches = [
  { key: 'background', value: '#F8FAF9', hasNote: true },
  { key: 'surface', value: '#FFFFFF', hasNote: true },
  { key: 'soft', value: '#F0F2F1', hasNote: true },
  { key: 'beige', value: '#F3EAD8', hasNote: true },
  { key: 'heading', value: '#1F4E4F', hasNote: true },
  { key: 'primary', value: '#256665', hasNote: true },
  { key: 'secondary', value: '#866C5A', hasNote: true },
  { key: 'success', value: '#4C7A5A', hasNote: true },
  { key: 'cta', value: '#D4A94F', hasNote: true },
  { key: 'ctaHover', value: '#C6922F', hasNote: false },
  { key: 'border', value: '#E5E7E6', hasNote: true },
  { key: 'beigeBorder', value: '#D6CFC4', hasNote: true },
] as const

const sortedExchanges = computed(() => {
  return [...exchangesStore.exchanges].sort((a, b) => {
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })
})

function statusBadgeClass(exchange: ExchangeDto) {
  if (exchange.isArchived) return 'text-bg-dark'
  if (exchange.isDrawn) return 'text-bg-success'
  return 'text-bg-secondary'
}

function statusLabel(exchange: ExchangeDto) {
  if (exchange.isArchived) return t('exchangeStatus.archived')
  if (exchange.isDrawn) return t('exchangeStatus.drawn')
  return t('exchangeStatus.undrawn')
}

function formatDate(value?: string) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString(locale.value)
}

function formatBudget(exchange: ExchangeDto) {
  if (exchange.budget == null) return '-'
  return formatMoney(exchange.budget)
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
      {{ t('actions.createExchange') }}
    </button>

    <section class="card border shadow-sm mb-4" :aria-label="t('development.paletteTitle')">
      <div class="card-body">
        <p class="text-uppercase small fw-semibold text-body-secondary mb-2">
          {{ t('development.paletteDraft') }}
        </p>
        <div class="d-flex flex-wrap gap-2">
          <div v-for="swatch in paletteSwatches" :key="swatch.key" class="palette-swatch">
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
                <span class="small fw-semibold text-primary-emphasis lh-sm">{{
                  t(`development.palette.${swatch.key}.name`)
                }}</span>
                <span class="small font-monospace text-body-secondary lh-sm">{{
                  swatch.value
                }}</span>
                <span v-if="swatch.hasNote" class="small fst-italic text-body-secondary lh-sm">{{
                  t(`development.palette.${swatch.key}.note`)
                }}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <div v-if="exchangesStore.isLoading">{{ t('common.loading') }}</div>
    <div v-else-if="exchangesStore.error">{{ exchangesStore.error }}</div>
    <div v-else-if="!sortedExchanges.length" class="alert alert-light border">
      {{ t('exchanges.empty') }}
    </div>
    <div v-else>
      <div class="d-flex flex-wrap gap-3">
        <div v-for="exchange in sortedExchanges" :key="exchange.id" class="exchange-card-slot">
          <router-link
            :to="{ name: 'exchange-detail', params: { id: exchange.id } }"
            class="text-decoration-none text-reset"
          >
            <article class="card h-100 border shadow-sm">
              <div class="card-body">
                <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
                  <h5 class="card-title mb-0">{{ exchange.name }}</h5>
                  <span class="badge" :class="statusBadgeClass(exchange)">
                    {{ statusLabel(exchange) }}
                  </span>
                </div>

                <p class="text-muted mb-3">
                  {{ exchange.description || t('exchanges.noDescription') }}
                </p>

                <dl class="exchange-meta d-flex flex-wrap mb-0 small">
                  <dt class="text-body-secondary fw-semibold">
                    {{ t('fields.organizerName') }}
                  </dt>
                  <dd class="mb-2">{{ exchange.organizerName || '-' }}</dd>

                  <dt class="text-body-secondary fw-semibold">
                    {{ t('common.participants') }}
                  </dt>
                  <dd class="mb-2">{{ participantsCount(exchange) }}</dd>

                  <dt class="text-body-secondary fw-semibold">
                    {{ t('fields.eventDate') }}
                  </dt>
                  <dd class="mb-2">{{ formatCivilDate(exchange.eventDate) }}</dd>

                  <dt class="text-body-secondary fw-semibold">{{ t('fields.budget') }}</dt>
                  <dd class="mb-2">{{ formatBudget(exchange) }}</dd>

                  <dt class="text-body-secondary fw-semibold">
                    {{ t('fields.minWishlistSuggestions') }}
                  </dt>
                  <dd class="mb-2">{{ exchange.minWishlistSuggestions ?? 0 }}</dd>

                  <dt class="text-body-secondary fw-semibold">
                    {{ t('exchanges.updatedAt') }}
                  </dt>
                  <dd class="mb-0">{{ formatDate(exchange.updatedAt) }}</dd>
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
