<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useApi } from '@/composables/useApi'
import type { ParticipantSelfViewDto, GiftSuggestionDto } from '@kado/shared'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const api = useApi()
const route = useRoute()

const isLoading = ref(true)
const error = ref<string | null>(null)
const view = ref<ParticipantSelfViewDto | null>(null)

function isSuggestionList(val: unknown): val is GiftSuggestionDto[] {
  return Array.isArray(val) && val.every((v) => v && typeof v === 'object' && 'title' in v)
}

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
          <div class="mb-1" v-if="view.participant.wishlist">
            <strong class="d-block mb-1">{{ t('participant.wishlist') }}:</strong>
            <template v-if="isSuggestionList(view.participant.wishlist)">
              <ol class="list-group list-group-numbered">
                <li
                  class="list-group-item d-flex align-items-center"
                  v-for="(s, idx) in view.participant.wishlist"
                  :key="idx"
                >
                  <img
                    v-if="s.imageUrl"
                    class="rounded me-2 flex-shrink-0"
                    :src="s.imageUrl"
                    :alt="s.title"
                    width="40"
                    height="40"
                    style="object-fit: cover;"
                  />
                  <i v-else-if="s.icon" class="me-2 bi" :class="`bi-${s.icon}`" aria-hidden="true"></i>
                  <span class="flex-grow-1">
                    <a v-if="s.linkUrl" :href="s.linkUrl" target="_blank" rel="noopener noreferrer">{{ s.title }}</a>
                    <span v-else>{{ s.title }}</span>
                  </span>
                </li>
              </ol>
            </template>
            <template v-else>
              <p class="mb-0">{{ view.participant.wishlist }}</p>
            </template>
          </div>
          <p class="mb-0" v-if="view.participant.note">
            <strong>{{ t('participant.note') }}:</strong> {{ view.participant.note }}
          </p>
        </div>
      </section>

      <section class="card" v-if="view.assignment">
        <div class="card-body">
          <h5 class="card-title">{{ t('participant.yourRecipient') }}</h5>
          <p class="mb-1"><strong>{{ t('participant.recipientName') }}:</strong> {{ view.assignment?.receiverName }}</p>
          <div class="mb-1" v-if="view.assignment?.receiverWishlist">
            <strong class="d-block mb-1">{{ t('participant.recipientWishlist') }}:</strong>
            <template v-if="isSuggestionList(view.assignment?.receiverWishlist)">
              <ol class="list-group list-group-numbered">
                <li
                  class="list-group-item d-flex align-items-center"
                  v-for="(s, idx) in (view.assignment?.receiverWishlist as GiftSuggestionDto[])"
                  :key="idx"
                >
                  <img
                    v-if="s.imageUrl"
                    class="rounded me-2 flex-shrink-0"
                    :src="s.imageUrl"
                    :alt="s.title"
                    width="40"
                    height="40"
                    style="object-fit: cover;"
                  />
                  <i v-else-if="s.icon" class="me-2 bi" :class="`bi-${s.icon}`" aria-hidden="true"></i>
                  <span class="flex-grow-1">
                    <a v-if="s.linkUrl" :href="s.linkUrl" target="_blank" rel="noopener noreferrer">{{ s.title }}</a>
                    <span v-else>{{ s.title }}</span>
                  </span>
                </li>
              </ol>
            </template>
            <template v-else>
              <p class="mb-0">{{ view.assignment?.receiverWishlist }}</p>
            </template>
          </div>
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
