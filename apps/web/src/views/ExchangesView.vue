
<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useExchangesStore } from '@/stores/exchanges'
import { useI18n } from 'vue-i18n'
import type { ExchangeDto } from '@kado/shared'

const { t } = useI18n()
const exchangesStore = useExchangesStore()

const name = ref('')
const description = ref('')
const organizerName = ref('')
const organizerParticipates = ref(true)
const adminPassword = ref('')
const showCreateModal = ref(false)

const fieldErrors = computed(() => exchangesStore.fieldErrors || {})
const formErrors = computed(() => exchangesStore.formErrors || [])

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
  if (!exchange.budget) return '-'
  const currency = exchange.budgetCurrency || 'CAD'
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(exchange.budget)
}

function participantsCount(exchange: ExchangeDto) {
  return exchange.participants?.length ?? 0
}

function openCreateModal() {
  showCreateModal.value = true
}

async function handleCreate() {
  exchangesStore.fieldErrors = null
  exchangesStore.formErrors = null
  if (!name.value.trim()) {
    // Handle client-side validation if needed
    return
  }
  try {
    await exchangesStore.createExchange({
      name: name.value,
      description: description.value,
      organizerName: organizerName.value,
      organizerParticipates: organizerParticipates.value,
      adminPassword: adminPassword.value
    })
    name.value = ''
    description.value = ''
    organizerName.value = ''
    organizerParticipates.value = true
    adminPassword.value = ''
    showCreateModal.value = false
  } catch {
    // Error is handled in store
  }
}

onMounted(() => {
  exchangesStore.fetchExchanges()
})
</script>

<template>
  <section class="py-4">
    <h1>{{ t('exchanges.title') }}</h1>

    <button class="btn btn-primary mb-3" @click="openCreateModal">{{ t('exchanges.createExchange') }}</button>

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
                  <dt class="col-5 text-body-secondary fw-semibold">{{ t('exchanges.organizer') }}</dt>
                  <dd class="col-7 mb-2">{{ exchange.organizerName || '-' }}</dd>

                  <dt class="col-5 text-body-secondary fw-semibold">{{ t('exchanges.participantsCount') }}</dt>
                  <dd class="col-7 mb-2">{{ participantsCount(exchange) }}</dd>

                  <dt class="col-5 text-body-secondary fw-semibold">{{ t('exchanges.eventDate') }}</dt>
                  <dd class="col-7 mb-2">{{ formatDate(exchange.eventDate) }}</dd>

                  <dt class="col-5 text-body-secondary fw-semibold">{{ t('exchanges.budget') }}</dt>
                  <dd class="col-7 mb-2">{{ formatBudget(exchange) }}</dd>

                  <dt class="col-5 text-body-secondary fw-semibold">{{ t('exchanges.updatedAt') }}</dt>
                  <dd class="col-7 mb-0">{{ formatDate(exchange.updatedAt) }}</dd>
                </dl>
              </div>
            </article>
          </router-link>
        </div>
      </div>
    </div>

    <!-- Modale pour créer un échange -->
    <dialog
      v-if="showCreateModal"
      open
      class="modal d-block position-fixed top-0 start-0 w-100 h-100 border-0 bg-dark bg-opacity-50 p-0 m-0"
      @close="showCreateModal = false"
    >
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">{{ t('exchanges.createModal.title') }}</h5>
            <button type="button" class="btn-close" @click="showCreateModal = false"></button>
          </div>
          <div class="modal-body">
            <form @submit.prevent="handleCreate">
              <div class="mb-3">
                <label for="exchangeName" class="form-label">{{ t('exchanges.createModal.name') }}</label>
                <input v-model="name" type="text" class="form-control" id="exchangeName" required />
                <div v-if="fieldErrors.name" class="text-danger small">{{ fieldErrors.name[0] }}</div>
              </div>
              <div class="mb-3">
                <label for="exchangeDescription" class="form-label">{{ t('exchanges.createModal.description') }}</label>
                <input v-model="description" type="text" class="form-control" id="exchangeDescription" />
                <div v-if="fieldErrors.description" class="text-danger small">{{ fieldErrors.description[0] }}</div>
              </div>
              <div class="mb-3">
                <label for="organizerName" class="form-label">{{ t('exchanges.createModal.organizerName') }}</label>
                <input v-model="organizerName" type="text" class="form-control" id="organizerName" required />
                <div v-if="fieldErrors.organizerName" class="text-danger small">{{ fieldErrors.organizerName[0] }}</div>
              </div>
              <div class="mb-3 form-check">
                <input v-model="organizerParticipates" type="checkbox" class="form-check-input" id="organizerParticipates" />
                <label class="form-check-label" for="organizerParticipates">{{ t('exchanges.createModal.organizerParticipates') }}</label>
              </div>
              <div class="mb-3">
                <label for="adminPassword" class="form-label">{{ t('exchanges.createModal.adminPassword') }}</label>
                <input v-model="adminPassword" type="password" class="form-control" id="adminPassword" required />
                <div v-if="fieldErrors.adminPassword" class="text-danger small">{{ fieldErrors.adminPassword[0] }}</div>
              </div>
              <div v-if="formErrors.length" class="text-danger mt-2">
                <div v-for="err in formErrors" :key="err">{{ err }}</div>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" @click="showCreateModal = false">{{ t('actions.cancel') }}</button>
            <button type="submit" class="btn btn-primary" @click="handleCreate">{{ t('exchanges.createModal.submit') }}</button>
          </div>
        </div>
      </div>
    </dialog>
  </section>
</template>
