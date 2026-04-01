<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useApi } from '@/composables/useApi'
import type { ParticipantSelfViewDto } from '@kado/shared'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const api = useApi()
const route = useRoute()

const isLoading = ref(true)
const error = ref<string | null>(null)
const view = ref<ParticipantSelfViewDto | null>(null)

async function fetchSelf() {
  isLoading.value = true
  error.value = null
  try {
    const token = route.params.token as string
    view.value = await api.get<ParticipantSelfViewDto>(`/api/p/${encodeURIComponent(token)}`)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unknown error'
  } finally {
    isLoading.value = false
  }
}

onMounted(fetchSelf)
</script>

<template>
  <main class="container py-4">
    <div v-if="isLoading">{{ t('participant.loading') }}</div>
    <div v-else-if="error" class="alert alert-danger">{{ error }}</div>
    <div v-else-if="view">
      <h2>{{ view.exchange.name }}</h2>
      <p class="text-muted" v-if="view.exchange.description">{{ view.exchange.description }}</p>

      <section class="card mb-3">
        <div class="card-body">
          <h5 class="card-title">{{ t('participant.yourInfo') }}</h5>
          <p class="mb-1"><strong>{{ t('participant.name') }}:</strong> {{ view.participant.name }}</p>
          <p class="mb-1" v-if="view.participant.wishlist">
            <strong>{{ t('participant.wishlist') }}:</strong> {{ view.participant.wishlist }}
          </p>
          <p class="mb-0" v-if="view.participant.note">
            <strong>{{ t('participant.note') }}:</strong> {{ view.participant.note }}
          </p>
        </div>
      </section>

      <section class="card" v-if="view.assignment">
        <div class="card-body">
          <h5 class="card-title">{{ t('participant.yourRecipient') }}</h5>
          <p class="mb-1"><strong>{{ t('participant.recipientName') }}:</strong> {{ view.assignment?.receiverName }}</p>
          <p class="mb-1" v-if="view.assignment?.receiverWishlist">
            <strong>{{ t('participant.recipientWishlist') }}:</strong> {{ view.assignment?.receiverWishlist }}
          </p>
          <p class="mb-0" v-if="view.assignment?.receiverNote">
            <strong>{{ t('participant.recipientNote') }}:</strong> {{ view.assignment?.receiverNote }}
          </p>
        </div>
      </section>
    </div>
  </main>

</template>

<style scoped>
.card { box-shadow: 0 2px 6px rgba(0,0,0,0.05); }
</style>
