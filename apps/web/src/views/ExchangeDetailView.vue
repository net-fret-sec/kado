<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useExchangesStore } from '@/stores/exchanges'
import type { ExchangeDto, ExclusionRule } from '@kado/shared'
import type { ParticipantDto } from '@kado/shared'
import { useI18n } from 'vue-i18n'
import { useApi } from '@/composables/useApi'
import EditExchangeModal from '@/components/EditExchangeModal.vue'
import AddParticipantModal from '@/components/AddParticipantModal.vue'
import EditParticipantModal from '@/components/EditParticipantModal.vue'
import ParticipantAccessLinkModal from '@/components/ParticipantAccessLinkModal.vue'
import { useToastsStore } from '@/stores/toasts'
import { getApiErrorMessage } from '@/composables/useApiErrorMessage'

const api = useApi()
const toasts = useToastsStore()

const { t } = useI18n()
const route = useRoute()
const exchangesStore = useExchangesStore()
const exchange = ref<ExchangeDto | null>(null)
const participants = ref<ParticipantDto[]>([])
const exclusionRules = ref<ExclusionRule[]>([])
const selectedExceptionReceiverByParticipant = ref<Record<string, string>>({})
const isLoading = ref(true)
const error = ref<string | null>(null)
const showEditExchangeModal = ref(false)
const isDrawActionLoading = ref(false)

// Pour les participants
const showAddParticipantModal = ref(false)
const showEditParticipantModal = ref(false)
const showAccessLinkModal = ref(false)
const editingParticipant = ref<ParticipantDto | null>(null)
const latestAccessLink = ref('')

const isExclusionEditingLocked = computed(() => {
  if (!exchange.value) return true
  return exchange.value.status === 'drawn' || exchange.value.status === 'archived'
})

const activeParticipants = computed(() =>
  participants.value.filter((participant) => participant.status === 'active'),
)

const participantNameById = computed(() => {
  return activeParticipants.value.reduce<Record<string, string>>((acc, participant) => {
    acc[participant.id] = participant.name
    return acc
  }, {})
})

const canTriggerDraw = computed(() => {
  if (!exchange.value) return false
  return exchange.value.status === 'draft' || exchange.value.status === 'ready'
})

const canCancelDraw = computed(() => {
  if (!exchange.value) return false
  return exchange.value.status === 'drawn'
})

const statusBadgeClass = computed(() => {
  switch (exchange.value?.status) {
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
})

const statusLabel = computed(() => {
  switch (exchange.value?.status) {
    case 'draft':
      return t('exchangeDetail.statusValues.draft')
    case 'ready':
      return t('exchangeDetail.statusValues.ready')
    case 'drawn':
      return t('exchangeDetail.statusValues.drawn')
    case 'archived':
      return t('exchangeDetail.statusValues.archived')
    default:
      return exchange.value?.status ?? '-'
  }
})

function legacyCopy(text: string) {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  textarea.setSelectionRange(0, textarea.value.length)

  let copied = false
  try {
    copied = document.execCommand('copy')
  } finally {
    document.body.removeChild(textarea)
  }

  return copied
}

async function copyToClipboard(text: string) {
  if (!text) {
    toasts.error(t('exchangeDetail.copyFailed'))
    return
  }

  try {
    if (window.isSecureContext && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      toasts.success(t('exchangeDetail.linkCopied'))
      return
    }
  } catch {
    // Ignore and try legacy copy below.
  }

  if (legacyCopy(text)) {
    toasts.success(t('exchangeDetail.linkCopied'))
    return
  }

  toasts.error(t('exchangeDetail.copyFailed'))
}

function openAccessLinkModal(link: string) {
  latestAccessLink.value = link
  showAccessLinkModal.value = true
}

async function copyAccessLinkFromModal() {
  if (!latestAccessLink.value) return
  await copyToClipboard(latestAccessLink.value)
}

async function fetchExchange() {
  isLoading.value = true
  error.value = null
  try {
    const id = route.params.id as string
    const [exchangeResponse, participantsResponse, exclusionsResponse] = await Promise.all([
      api.get<ExchangeDto>(`/api/exchanges/${id}`),
      api.get<ParticipantDto[]>(`/api/exchanges/${id}/participants`),
      api.get<ExclusionRule[]>(`/api/exchanges/${id}/exclusions`),
    ])

    exchange.value = exchangeResponse
    participants.value = participantsResponse
    exclusionRules.value = exclusionsResponse
  } catch (err) {
    const message = getApiErrorMessage(err)
    error.value = message
    toasts.error(message)
  } finally {
    isLoading.value = false
  }
}

function getParticipantExclusions(participantId: string) {
  return exclusionRules.value.filter((rule) => rule.giverParticipantId === participantId)
}

function getReceiverCandidates(participantId: string) {
  const excludedReceiverIds = new Set(
    getParticipantExclusions(participantId).map((rule) => rule.receiverParticipantId),
  )

  return activeParticipants.value.filter((candidate) => {
    return candidate.id !== participantId && !excludedReceiverIds.has(candidate.id)
  })
}

async function addParticipantExclusion(giverParticipantId: string) {
  if (!exchange.value || isExclusionEditingLocked.value) return

  const receiverParticipantId = selectedExceptionReceiverByParticipant.value[giverParticipantId]
  if (!receiverParticipantId) return

  try {
    const createdRule = await api.post<ExclusionRule>(
      `/api/exchanges/${exchange.value.id}/exclusions`,
      {
        giverParticipantId,
        receiverParticipantId,
      },
    )

    exclusionRules.value.push(createdRule)
    selectedExceptionReceiverByParticipant.value[giverParticipantId] = ''
    toasts.success(t('exchangeDetail.exceptions.added'))
  } catch (err) {
    toasts.error(getApiErrorMessage(err, { fallbackKey: 'exchangeDetail.exceptions.addFailed' }))
  }
}

async function removeParticipantExclusion(ruleId: string) {
  if (!exchange.value || isExclusionEditingLocked.value) return

  try {
    await api.delete(`/api/exchanges/${exchange.value.id}/exclusions/${ruleId}`)
    exclusionRules.value = exclusionRules.value.filter((rule) => rule.id !== ruleId)
    toasts.success(t('exchangeDetail.exceptions.removed'))
  } catch (err) {
    toasts.error(getApiErrorMessage(err, { fallbackKey: 'exchangeDetail.exceptions.removeFailed' }))
  }
}

onMounted(() => {
  // S'assurer que les modales ne sont jamais ouvertes au chargement
  showAddParticipantModal.value = false
  showEditParticipantModal.value = false
  editingParticipant.value = null
  fetchExchange()
})

function startEdit() {
  if (!exchange.value) return
  showEditExchangeModal.value = true
}

async function saveEdit(payload: {
  name: string
  description: string
  status: ExchangeDto['status']
  eventDate?: string
  drawDeadlineAt?: string
  suggestionsDeadlineAt?: string
  budget?: number
  budgetCurrency?: string
  minWishlistSuggestions: number
  lockSuggestionsAfterDraw: boolean
  noMutualAssignments: boolean
}) {
  if (!exchange.value) return
  try {
    await exchangesStore.updateExchange(exchange.value.id, {
      name: payload.name,
      description: payload.description,
      status: payload.status,
      eventDate: payload.eventDate,
      drawDeadlineAt: payload.drawDeadlineAt,
      suggestionsDeadlineAt: payload.suggestionsDeadlineAt,
      budget: payload.budget,
      budgetCurrency: payload.budgetCurrency,
      minWishlistSuggestions: payload.minWishlistSuggestions,
      lockSuggestionsAfterDraw: payload.lockSuggestionsAfterDraw,
      noMutualAssignments: payload.noMutualAssignments,
    })
    showEditExchangeModal.value = false
    await fetchExchange()
  } catch (err) {
    console.error(err)
    toasts.error(getApiErrorMessage(err, { fallbackMessage: "Erreur lors de l'ajout" }))
  }
}

async function handleDelete() {
  if (!exchange.value) return
  if (!confirm(t('exchangeDetail.confirmDeleteExchange'))) return
  try {
    await exchangesStore.deleteExchange(exchange.value.id)
    window.location.href = '/exchanges'
  } catch (err) {
    console.error(err)
    toasts.error(getApiErrorMessage(err, { fallbackMessage: 'Erreur lors de la modification' }))
  }
}

// Fonctions pour les participants
function openAddParticipantModal() {
  showAddParticipantModal.value = true
}

function openEditParticipantModal(participant: ParticipantDto) {
  editingParticipant.value = participant
  showEditParticipantModal.value = true
}

function setEditParticipantModalVisibility(value: boolean) {
  showEditParticipantModal.value = value
  if (!value) {
    editingParticipant.value = null
  }
}

function setAccessLinkModalVisibility(value: boolean) {
  showAccessLinkModal.value = value
  if (!value) {
    latestAccessLink.value = ''
  }
}

async function addParticipant(payload: { name: string; email: string }) {
  if (!exchange.value) return
  try {
    const result = await api.post<{ participant: ParticipantDto; accessLink: string }>(
      `/api/exchanges/${exchange.value.id}/participants`,
      {
        name: payload.name,
        email: payload.email,
      },
    )
    showAddParticipantModal.value = false
    if (result?.accessLink) {
      await copyToClipboard(result.accessLink)
      openAccessLinkModal(result.accessLink)
    }
    await fetchExchange()
  } catch (err) {
    console.error(err)
  }
}

async function updateParticipant(payload: {
  name: string
  email: string
  wishlist: ParticipantDto['wishlist']
  note: string
}) {
  if (!editingParticipant.value || !exchange.value) return
  try {
    await api.put(
      `/api/exchanges/${exchange.value.id}/participants/${editingParticipant.value.id}`,
      {
        name: payload.name,
        email: payload.email,
        wishlist: payload.wishlist,
        note: payload.note,
      },
    )
    setEditParticipantModalVisibility(false)
    await fetchExchange()
  } catch (err) {
    console.error(err)
  }
}

async function deleteParticipant(participantId: string) {
  if (!exchange.value) return
  if (!confirm(t('exchangeDetail.confirmDeleteParticipant'))) return
  try {
    await api.delete(`/api/exchanges/${exchange.value.id}/participants/${participantId}`)
    await fetchExchange()
  } catch (err) {
    console.error(err)
    toasts.error(getApiErrorMessage(err, { fallbackMessage: 'Erreur lors de la suppression' }))
  }
}

async function regenerateParticipantLink(participantId: string) {
  if (!exchange.value) return
  try {
    const payload = { revokeExisting: true }
    const result = await api.post<{ participantId: string; accessLink: string }, typeof payload>(
      `/api/exchanges/${exchange.value.id}/participants/${participantId}/access/regenerate`,
      payload,
    )
    if (result?.accessLink) {
      await copyToClipboard(result.accessLink)
      openAccessLinkModal(result.accessLink)
    }
  } catch (err) {
    console.error(err)
    toasts.error(getApiErrorMessage(err, { fallbackKey: 'exchangeDetail.generateFailed' }))
  }
}

async function triggerDraw() {
  if (!exchange.value || !canTriggerDraw.value || isDrawActionLoading.value) return
  if (!confirm(t('exchangeDetail.confirmTriggerDraw'))) return

  isDrawActionLoading.value = true
  try {
    await api.post(`/api/exchanges/${exchange.value.id}/draw`)
    toasts.success(t('exchangeDetail.drawSuccess'))
    await fetchExchange()
  } catch (err) {
    toasts.error(getApiErrorMessage(err, { fallbackKey: 'exchangeDetail.drawFailed' }))
  } finally {
    isDrawActionLoading.value = false
  }
}

async function cancelDraw() {
  if (!exchange.value || !canCancelDraw.value || isDrawActionLoading.value) return
  if (!confirm(t('exchangeDetail.confirmCancelDraw'))) return

  isDrawActionLoading.value = true
  try {
    await api.post(`/api/exchanges/${exchange.value.id}/draw/cancel`)
    toasts.success(t('exchangeDetail.cancelDrawSuccess'))
    await fetchExchange()
  } catch (err) {
    toasts.error(getApiErrorMessage(err, { fallbackKey: 'exchangeDetail.cancelDrawFailed' }))
  } finally {
    isDrawActionLoading.value = false
  }
}
</script>

<template>
  <section id="exchange-detail-view">
    <div v-if="isLoading">{{ t('exchangeDetail.loading') }}</div>
    <div v-else-if="error">{{ error }}</div>
    <div v-else-if="exchange" class="d-md-flex gap-4">
      <!-- Détails de l'échange -->
      <section id="detail">
        <div>
          <h2>{{ exchange.name }}</h2>
          <p>{{ exchange.description }}</p>
          <ul>
            <li>
              <b>{{ t('exchangeDetail.organizer') }} :</b> {{ exchange.organizerName }}
            </li>
            <li>
              <b>{{ t('exchangeDetail.status') }} :</b>
              <span class="badge ms-1" :class="statusBadgeClass">{{ statusLabel }}</span>
            </li>
            <li v-if="exchange.eventDate">
              <b>{{ t('exchangeDetail.exchangeMoment') }} :</b> {{ exchange.eventDate }}
            </li>
            <li v-if="exchange.drawDeadlineAt">
              <b>{{ t('exchangeDetail.drawDeadlineAt') }} :</b>
              {{ new Date(exchange.drawDeadlineAt).toLocaleString() }}
            </li>
            <li v-if="exchange.suggestionsDeadlineAt">
              <b>{{ t('exchangeDetail.suggestionsDeadlineAt') }} :</b>
              {{ new Date(exchange.suggestionsDeadlineAt).toLocaleString() }}
            </li>
            <li v-if="exchange.budget != null">
              <b>{{ t('exchangeDetail.budget') }} :</b> {{ exchange.budget }}
              {{ exchange.budgetCurrency }}
            </li>
            <li>
              <b>{{ t('exchangeDetail.minWishlistSuggestions') }} :</b>
              {{ exchange.minWishlistSuggestions ?? 0 }}
            </li>
            <li>
              <b>{{ t('exchangeDetail.lockSuggestionsAfterDraw') }} :</b>
              {{
                (exchange.lockSuggestionsAfterDraw ?? true)
                  ? t('exchangeDetail.enabled')
                  : t('exchangeDetail.disabled')
              }}
            </li>
            <li>
              <b>{{ t('exchangeDetail.noMutualAssignments') }} :</b>
              {{
                exchange.noMutualAssignments
                  ? t('exchangeDetail.enabled')
                  : t('exchangeDetail.disabled')
              }}
            </li>
            <li>
              <b>{{ t('exchangeDetail.createdAt') }} :</b>
              {{ new Date(exchange.createdAt).toLocaleString() }}
            </li>
          </ul>

          <div class="btn-group">
            <button class="btn btn-warning" @click="startEdit">
              {{ t('exchangeDetail.edit') }}
            </button>
            <button
              class="btn btn-success"
              :disabled="!canTriggerDraw || isDrawActionLoading"
              @click="triggerDraw"
            >
              {{ t('exchangeDetail.triggerDraw') }}
            </button>
            <button
              class="btn btn-outline-warning"
              :disabled="!canCancelDraw || isDrawActionLoading"
              @click="cancelDraw"
            >
              {{ t('exchangeDetail.cancelDraw') }}
            </button>
            <button class="btn btn-danger" @click="handleDelete">
              {{ t('exchangeDetail.delete') }}
            </button>
          </div>
        </div>
      </section>

      <!-- Participants -->
      <section id="participants">
        <div v-if="participants.length">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h3>{{ t('exchangeDetail.participants') }}</h3>
            <button class="btn btn-sm btn-primary" @click="openAddParticipantModal">
              {{ t('exchangeDetail.addParticipant') }}
            </button>
          </div>

          <ul class="list-group">
            <li
              v-for="participant in participants"
              :key="participant.id"
              class="list-group-item d-flex justify-content-between align-items-center"
            >
              <div>
                <strong>{{ participant.name }}</strong>
                <!-- <span v-if="participant.email" class="text-muted"> ({{ participant.email }})</span> -->

                <div v-if="participant.wishlist?.length" class="small">
                  <!-- <span class="me-1">{{ t('exchangeDetail.wishlist') }}:</span> -->
                  <span class="badge text-bg-light">{{
                    t('exchangeDetail.wishlistSuggestions', participant.wishlist.length)
                  }}</span>
                </div>

                <div v-if="participant.note" class="small">
                  {{ t('exchangeDetail.note') }}: {{ participant.note }}
                </div>

                <div class="small mt-2 d-none">
                  <div class="fw-semibold mb-1">{{ t('exchangeDetail.exceptions.title') }}</div>
                  <ul v-if="getParticipantExclusions(participant.id).length" class="mb-2 ps-3">
                    <li
                      v-for="rule in getParticipantExclusions(participant.id)"
                      :key="rule.id"
                      class="d-flex align-items-center gap-2 mb-1"
                    >
                      <span>
                        {{ t('exchangeDetail.exceptions.cannotDraw') }}
                        {{
                          participantNameById[rule.receiverParticipantId] ||
                          rule.receiverParticipantId
                        }}
                      </span>
                      <button
                        type="button"
                        class="btn btn-sm btn-outline-danger"
                        :disabled="isExclusionEditingLocked"
                        @click="removeParticipantExclusion(rule.id)"
                      >
                        {{ t('exchangeDetail.exceptions.remove') }}
                      </button>
                    </li>
                  </ul>

                  <p v-else class="mb-2 text-muted">{{ t('exchangeDetail.exceptions.none') }}</p>
                  <div
                    class="d-flex gap-2 align-items-center"
                    v-if="participant.status === 'active'"
                  >
                    <select
                      class="form-select form-select-sm"
                      :disabled="
                        isExclusionEditingLocked || !getReceiverCandidates(participant.id).length
                      "
                      v-model="selectedExceptionReceiverByParticipant[participant.id]"
                    >
                      <option value="">{{ t('exchangeDetail.exceptions.selectReceiver') }}</option>
                      <option
                        v-for="candidate in getReceiverCandidates(participant.id)"
                        :key="candidate.id"
                        :value="candidate.id"
                      >
                        {{ candidate.name }}
                      </option>
                    </select>
                    <button
                      type="button"
                      class="btn btn-sm btn-outline-primary"
                      :disabled="
                        isExclusionEditingLocked ||
                        !selectedExceptionReceiverByParticipant[participant.id]
                      "
                      @click="addParticipantExclusion(participant.id)"
                    >
                      {{ t('exchangeDetail.exceptions.add') }}
                    </button>
                  </div>

                  <p v-if="isExclusionEditingLocked" class="mb-0 text-muted">
                    {{ t('exchangeDetail.exceptions.locked') }}
                  </p>
                </div>
              </div>
              <div class="btn-group">
                <button
                  class="btn btn-sm btn-outline-primary"
                  @click="openEditParticipantModal(participant)"
                >
                  {{ t('exchangeDetail.edit') }}
                </button>
                <button
                  class="btn btn-sm btn-outline-secondary"
                  @click="regenerateParticipantLink(participant.id)"
                >
                  {{ t('exchangeDetail.generateLink') }}
                </button>
                <button
                  class="btn btn-sm btn-outline-danger"
                  @click="deleteParticipant(participant.id)"
                >
                  {{ t('exchangeDetail.delete') }}
                </button>
              </div>
            </li>
          </ul>
        </div>
        <div v-else>
          <h3>{{ t('exchangeDetail.participants') }}</h3>
          <p>
            <em>{{ t('exchangeDetail.noParticipants') }}</em>
          </p>
          <button class="btn btn-primary" @click="openAddParticipantModal">
            {{ t('exchangeDetail.addParticipant') }}
          </button>
        </div>
      </section>

      <EditExchangeModal
        :model-value="showEditExchangeModal"
        :name="exchange.name"
        :description="exchange.description || ''"
        :status="exchange.status"
        :event-date="exchange.eventDate"
        :draw-deadline-at="exchange.drawDeadlineAt"
        :suggestions-deadline-at="exchange.suggestionsDeadlineAt"
        :budget="exchange.budget"
        :budget-currency="exchange.budgetCurrency"
        :min-wishlist-suggestions="exchange.minWishlistSuggestions"
        :lock-suggestions-after-draw="exchange.lockSuggestionsAfterDraw"
        :no-mutual-assignments="exchange.noMutualAssignments"
        @update:model-value="(value) => (showEditExchangeModal = value)"
        @submit="saveEdit"
      />

      <AddParticipantModal
        :model-value="showAddParticipantModal"
        @update:model-value="(value) => (showAddParticipantModal = value)"
        @submit="addParticipant"
      />

      <EditParticipantModal
        :model-value="showEditParticipantModal"
        :participant="editingParticipant"
        @update:model-value="setEditParticipantModalVisibility"
        @submit="updateParticipant"
      />

      <ParticipantAccessLinkModal
        :model-value="showAccessLinkModal"
        :link="latestAccessLink"
        @update:model-value="setAccessLinkModalVisibility"
        @copy="copyAccessLinkFromModal"
      />
    </div>
  </section>
</template>
