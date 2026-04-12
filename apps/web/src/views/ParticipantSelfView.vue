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
type EditableSuggestion = GiftSuggestionDto & { _clientId: string }

let clientIdCounter = 0

function generateClientId(): string {
  const c = globalThis.crypto
  if (c?.randomUUID) {
    return c.randomUUID()
  }

  if (c?.getRandomValues) {
    const bytes = new Uint8Array(16)
    c.getRandomValues(bytes)
    bytes[6] = (bytes[6]! & 0x0f) | 0x40
    bytes[8] = (bytes[8]! & 0x3f) | 0x80
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }

  clientIdCounter += 1
  return `cid-${Date.now().toString(36)}-${clientIdCounter.toString(36)}`
}

function withClientId(suggestion: GiftSuggestionDto): EditableSuggestion {
  return {
    ...suggestion,
    _clientId: generateClientId(),
  }
}

const wishlist = ref<EditableSuggestion[]>([])

function areSuggestionsUpdatesClosed() {
  const exchange = view.value?.exchange
  if (!exchange) return true

  if (exchange.status === 'archived') {
    return true
  }

  if (exchange.suggestionsDeadlineAt) {
    const suggestionsDeadline = new Date(exchange.suggestionsDeadlineAt)
    if (
      !Number.isNaN(suggestionsDeadline.getTime()) &&
      suggestionsDeadline.getTime() < Date.now()
    ) {
      return true
    }
  }

  const lockAfterDraw = exchange.lockSuggestionsAfterDraw ?? true
  return exchange.status === 'drawn' && lockAfterDraw
}

const canEdit = computed(() => {
  return !areSuggestionsUpdatesClosed()
})

const hasRecipient = computed(() => !!view.value?.assignment)
const showRecipient = computed(() => {
  const status = view.value?.exchange.status
  return hasRecipient.value && (status === 'drawn' || status === 'archived')
})
const requiredMinSuggestions = computed(() => view.value?.exchange.minWishlistSuggestions ?? 0)

const canSubmit = computed(() => {
  if (!name.value.trim()) return false
  if (!isValidEmail(email.value)) return false
  if (wishlist.value.length < requiredMinSuggestions.value) return false
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
  wishlist.value = (view.value?.participant.wishlist ?? []).map(withClientId)
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
      expectedUpdatedAt: view.value?.participant.updatedAt,
      wishlist: wishlist.value.length
        ? wishlist.value.map(({ _clientId: _discardedClientId, ...suggestion }) => suggestion)
        : undefined,
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
  wishlist.value.push(withClientId({ title: '' }))
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

      <form @submit.prevent="saveSelf">
        <div class="d-flex">
          <section class="card mb-3">
            <div class="card-body">
              <h5 class="card-title">{{ t('participant.profileSectionTitle') }}</h5>
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
              <div class="mb-0">
                <label for="participant-note" class="form-label">{{ t('participant.note') }}</label>
                <textarea
                  id="participant-note"
                  v-model="note"
                  class="form-control"
                  rows="3"
                  :disabled="!canEdit || isSaving"
                ></textarea>
              </div>
            </div>
          </section>
          <section class="card mb-3">
            <div class="card-body">
              <h5 class="card-title">{{ t('participant.suggestionsSectionTitle') }}</h5>
              <p v-if="requiredMinSuggestions > 0" class="small text-body-secondary">
                {{ t('participant.minWishlistSuggestionsHint', { count: requiredMinSuggestions }) }}
              </p>
              <WishlistSuggestionItem
                v-for="(element, index) in wishlist"
                :key="element._clientId"
                :modelValue="element"
                mode="edit"
                :removable="canEdit && !isSaving"
                :showHandle="false"
                :asListItem="true"
                @update:modelValue="
                  (v) => wishlist.splice(index, 1, { ...v, _clientId: element._clientId })
                "
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
              <p class="text-danger small mt-2" v-if="wishlist.length < requiredMinSuggestions">
                {{
                  t('participant.minWishlistSuggestionsError', { count: requiredMinSuggestions })
                }}
              </p>
              <button
                v-if="canEdit"
                type="submit"
                class="btn btn-primary mt-3"
                :disabled="!canSubmit || isSaving"
              >
                {{ isSaving ? t('participant.saving') : t('participant.save') }}
              </button>
            </div>
          </section>
        </div>

        <section class="card mb-3" v-if="showRecipient">
          <div class="card-body">
            <h5 class="card-title">{{ t('participant.recipientSectionTitle') }}</h5>
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
            <div class="mb-1" v-if="view.assignment?.receiverNote">
              <strong>{{ t('participant.recipientNote') }}:</strong>
              {{ view.assignment?.receiverNote }}
            </div>
          </div>
        </section>
      </form>
    </div>
  </section>
</template>
