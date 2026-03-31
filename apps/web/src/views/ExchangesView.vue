
<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useExchangesStore } from '@/stores/exchanges'
import { useI18n } from 'vue-i18n'

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
  <main class="container py-4">
    <h1>{{ t('exchanges.title') }}</h1>

    <button class="btn btn-primary mb-3" @click="openCreateModal">{{ t('exchanges.createExchange') }}</button>

    <div v-if="exchangesStore.isLoading">{{ t('exchanges.loading') }}</div>
    <div v-else-if="exchangesStore.error">{{ exchangesStore.error }}</div>
    <div v-else>
      <ul class="list-group">
        <li v-for="exchange in exchangesStore.exchanges" :key="exchange.id" class="list-group-item">
          <router-link :to="{ name: 'exchange-detail', params: { id: exchange.id } }" class="text-decoration-none">
            <h5>{{ exchange.name }}</h5>
            <p>{{ exchange.description }}</p>
            <small>{{ t('exchanges.status') }}: {{ exchange.status }}</small>
          </router-link>
        </li>
      </ul>
    </div>

    <!-- Modale pour créer un échange -->
    <dialog v-if="showCreateModal" open class="modal" @close="showCreateModal = false">
      <div class="modal-dialog">
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
  </main>
</template>

<style scoped>
.modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1050;
}

.modal-dialog {
  max-width: 500px;
  width: 90%;
}

.modal-content {
  background: white;
  border-radius: 0.375rem;
  box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15);
}

.modal-header {
  padding: 1rem;
  border-bottom: 1px solid #dee2e6;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-title {
  margin: 0;
}

.btn-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
}

.modal-body {
  padding: 1rem;
}
</style>
