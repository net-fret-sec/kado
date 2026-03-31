
<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useExchangesStore } from '@/stores/exchanges'

const exchangesStore = useExchangesStore()

const name = ref('')
const description = ref('')
const organizerName = ref('')
const organizerParticipates = ref(true)
const adminPassword = ref('')

const fieldErrors = computed(() => exchangesStore.fieldErrors || {})
const formErrors = computed(() => exchangesStore.formErrors || [])

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
  } catch (err) {
    // Error is handled in store
  }
}

onMounted(() => {
  exchangesStore.fetchExchanges()
})
</script>

<template>
  <main class="container py-4">
    <h1>Exchanges</h1>

    <!-- Formulaire de création d'échange -->

    <form @submit.prevent="handleCreate" class="mb-4">
      <div class="mb-2">
        <input v-model="name" type="text" placeholder="Nom de l'échange" class="form-control" required />
        <div v-if="fieldErrors.name" class="text-danger small">{{ fieldErrors.name[0] }}</div>
      </div>
      <div class="mb-2">
        <input v-model="description" type="text" placeholder="Description" class="form-control" />
        <div v-if="fieldErrors.description" class="text-danger small">{{ fieldErrors.description[0] }}</div>
      </div>
      <div class="mb-2">
        <input v-model="organizerName" type="text" placeholder="Nom de l'organisateur" class="form-control" required />
        <div v-if="fieldErrors.organizerName" class="text-danger small">{{ fieldErrors.organizerName[0] }}</div>
      </div>
      <div class="mb-2 form-check">
        <input v-model="organizerParticipates" type="checkbox" class="form-check-input" id="organizerParticipates" />
        <label class="form-check-label" for="organizerParticipates">L'organisateur participe à l'échange</label>
      </div>
      <div class="mb-2">
        <input v-model="adminPassword" type="password" placeholder="Mot de passe admin" class="form-control" required />
        <div v-if="fieldErrors.adminPassword" class="text-danger small">{{ fieldErrors.adminPassword[0] }}</div>
      </div>
      <button type="submit" class="btn btn-primary">Créer l'échange</button>
      <div v-if="formErrors.length" class="text-danger mt-2">
        <div v-for="err in formErrors" :key="err">{{ err }}</div>
      </div>
    </form>

    <div v-if="exchangesStore.isLoading">Loading...</div>
    <div v-else-if="exchangesStore.error">{{ exchangesStore.error }}</div>
    <div v-else>
      <ul class="list-group">
        <li v-for="exchange in exchangesStore.exchanges" :key="exchange.id" class="list-group-item">
          <router-link :to="{ name: 'exchange-detail', params: { id: exchange.id } }" class="text-decoration-none">
            <h5>{{ exchange.name }}</h5>
            <p>{{ exchange.description }}</p>
            <small>Status: {{ exchange.status }}</small>
          </router-link>
        </li>
      </ul>
    </div>
  </main>
</template>
