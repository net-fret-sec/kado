<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useApi } from '@/composables/useApi'
import type {
  GiftSuggestionDto,
  ParticipantSelfViewDto,
  UpdateParticipantInputDto,
} from '@kado/shared'
import { useI18n } from 'vue-i18n'
import WishlistSuggestionItem from '@/components/WishlistSuggestionItem.vue'
import { useToastsStore } from '@/stores/toasts'
import { getApiErrorMessage } from '@/composables/useApiErrorMessage'

const { t } = useI18n()
const api = useApi()
const route = useRoute()
const toasts = useToastsStore()

const isLoading = ref(true)
const isSaving = ref(false)
const error = ref<string | null>(null)
const view = ref<ParticipantSelfViewDto | null>(null)
const name = ref('')
const email = ref('')
const note = ref('')
const wishlist = ref<GiftSuggestionDto[]>([])

const canEdit = computed(() => {
  const status = view.value?.exchange.status
  return status === 'draft' || status === 'ready'
})

const hasRecipient = computed(() => !!view.value?.assignment)

const canSubmit = computed(() => {
  if (!name.value.trim()) return false
  if (!isValidEmail(email.value)) return false
  return wishlist.value.every(isValidSuggestion)
})

function isValidEmail(value: string) {
  const v = value.trim()
  if (!v) return true
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

function isValidUrl(value?: string) {
  if (!value) return true
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function isValidSuggestion(s: GiftSuggestionDto) {
  const titleOk = !!s.title?.trim()
  const imageOk = isValidUrl(s.imageUrl)
  const linkOk = isValidUrl(s.linkUrl)
  return titleOk && imageOk && linkOk
}

function hydrateForm() {
  name.value = view.value?.participant.name ?? ''
  email.value = view.value?.participant.email ?? ''
  note.value = view.value?.participant.note ?? ''
  wishlist.value = [...(view.value?.participant.wishlist ?? [])]
}

async function fetchSelf() {
  isLoading.value = true
  error.value = null
  try {
    const token = route.params.token as string
    view.value = await api.get<ParticipantSelfViewDto>(`/api/p/${encodeURIComponent(token)}`)
    hydrateForm()
  } catch (err) {
    error.value = getApiErrorMessage(err)
  } finally {
    isLoading.value = false
  }
}

async function saveSelf() {
  if (!canEdit.value || !canSubmit.value) return

  isSaving.value = true
  error.value = null
  try {
    const token = route.params.token as string
    const payload: UpdateParticipantInputDto = {
      name: name.value.trim(),
      email: email.value.trim() || undefined,
      note: note.value.trim() || undefined,
      wishlist: wishlist.value.length ? wishlist.value : undefined,
    }

    view.value = await api.put<ParticipantSelfViewDto, UpdateParticipantInputDto>(
      `/api/p/${encodeURIComponent(token)}`,
      payload,
    )
    hydrateForm()
    toasts.success(t('participant.saveSuccess'))
  } catch (err) {
    const message = getApiErrorMessage(err)
    error.value = message
    toasts.error(message)
  } finally {
    isSaving.value = false
  }
}

function addSuggestion() {
  wishlist.value.push({ title: '' })
}

onMounted(fetchSelf)
</script>

<template>
  <section id="participant-self-view">
    <div v-if="isLoading">{{ t('participant.loading') }}</div>
    <div v-else-if="error" class="alert alert-danger">{{ error }}</div>
    <div v-else-if="view">
      <h2>{{ view.exchange.name }}</h2>
      <p class="text-muted" v-if="view.exchange.description">{{ view.exchange.description }}</p>
      <div class="alert" :class="canEdit ? 'alert-info' : 'alert-secondary'">
        {{ canEdit ? t('participant.editingOpen') : t('participant.editingClosed') }}
      </div>

      <section class="card mb-3">
        <div class="card-body">
          <h5 class="card-title">{{ t('participant.yourInfo') }}</h5>
          <form @submit.prevent="saveSelf">
            <div class="mb-3">
              <label for="participant-name" class="form-label">{{ t('participant.name') }}</label>
              <input
                id="participant-name"
                v-model="name"
                class="form-control"
                type="text"
                :disabled="!canEdit || isSaving"
                required
              />
            </div>

            <div class="mb-3">
              <label for="participant-email" class="form-label">{{ t('participant.email') }}</label>
              <input
                id="participant-email"
                v-model="email"
                class="form-control"
                type="email"
                :class="{ 'is-invalid': email.trim().length > 0 && !isValidEmail(email) }"
                :disabled="!canEdit || isSaving"
                placeholder="alex@example.com"
              />
            </div>

            <div class="mb-3">
              <label class="form-label mb-2">{{ t('participant.wishlist') }}</label>
              <WishlistSuggestionItem
                v-for="(element, index) in wishlist"
                :key="`${index}-${element.title}`"
                :modelValue="element"
                mode="edit"
                :removable="canEdit && !isSaving"
                :showHandle="false"
                :asListItem="true"
                @update:modelValue="(v) => wishlist.splice(index, 1, v)"
                @remove="wishlist.splice(index, 1)"
              />

              <button
                v-if="canEdit"
                type="button"
                class="btn btn-sm btn-outline-primary mt-2"
                :disabled="isSaving"
                @click="addSuggestion"
              >
                <i class="bi bi-plus-lg"></i>
                {{ t('participant.addSuggestion') }}
              </button>
              <p class="text-muted mb-0 mt-2" v-if="!wishlist.length">
                {{ t('participant.noSuggestions') }}
              </p>
            </div>

            <div class="mb-3">
              <label for="participant-note" class="form-label">{{ t('participant.note') }}</label>
              <textarea
                id="participant-note"
                v-model="note"
                class="form-control"
                rows="3"
                :disabled="!canEdit || isSaving"
              ></textarea>
            </div>

            <button
              v-if="canEdit"
              type="submit"
              class="btn btn-primary"
              :disabled="!canSubmit || isSaving"
            >
              {{ isSaving ? t('participant.saving') : t('participant.save') }}
            </button>
          </form>
        </div>
      </section>

      <section class="card" v-if="hasRecipient">
        <div class="card-body">
          <h5 class="card-title">{{ t('participant.yourRecipient') }}</h5>
          <p class="mb-1">
            <strong>{{ t('participant.recipientName') }}:</strong>
            {{ view.assignment?.receiverName }}
          </p>
          <div class="mb-1" v-if="view.assignment?.receiverWishlist?.length">
            <strong class="d-block mb-1">{{ t('participant.recipientWishlist') }}:</strong>
            <ol class="list-group list-group-numbered">
              <li
                class="list-group-item"
                v-for="(s, idx) in view.assignment?.receiverWishlist"
                :key="idx"
              >
                <WishlistSuggestionItem :modelValue="s" mode="detail" />
              </li>
            </ol>
          </div>
          <p class="mb-0" v-if="view.assignment?.receiverNote">
            <strong>{{ t('participant.recipientNote') }}:</strong>
            {{ view.assignment?.receiverNote }}
          </p>
        </div>
      </section>
    </div>
  </section>
</template>
