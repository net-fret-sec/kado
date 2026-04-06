<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useExchangesStore } from '@/stores/exchanges'
import type { ExchangeDto, ExclusionRule } from '@kado/shared'
import type { ParticipantDto, GiftSuggestionDto } from '@kado/shared'
import { useI18n } from 'vue-i18n'
import { useApi } from '@/composables/useApi'
import WishlistSuggestionItem from '@/components/WishlistSuggestionItem.vue'
import BaseModal from '@/components/BaseModal.vue'
import Draggable from 'vuedraggable'
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
const editName = ref('')
const editDescription = ref('')
const editStatus = ref('active')
const editNoMutualAssignments = ref(false)
const showEditExchangeModal = ref(false)
const isDrawActionLoading = ref(false)

// Pour les participants
const showAddParticipantModal = ref(false)
const showEditParticipantModal = ref(false)
const showAccessLinkModal = ref(false)
const editingParticipant = ref<ParticipantDto | null>(null)
const accessLinkInput = ref<HTMLInputElement | null>(null)
const latestAccessLink = ref('')
const newParticipantName = ref('')
const newParticipantEmail = ref('')
const newParticipantNote = ref('')
const newParticipantWishlistList = ref<GiftSuggestionDto[]>([])

function isValidUrl(u?: string | null) {
  if (!u) return true
  try {
    const parsed = new URL(u)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function isValidSuggestion(s: GiftSuggestionDto) {
  const titleOk = !!s?.title && s.title.trim().length > 0
  const imgOk = isValidUrl(s?.imageUrl)
  const linkOk = isValidUrl(s?.linkUrl)
  return titleOk && imgOk && linkOk
}

function isValidEmail(value: string) {
  const email = value.trim()
  if (!email) return true
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

const isListModeValid = computed(() => {
  if (!newParticipantWishlistList.value || newParticipantWishlistList.value.length === 0)
    return false
  return newParticipantWishlistList.value.every(isValidSuggestion)
})

const isAddFormValid = computed(() => {
  const nameOk = newParticipantName.value.trim().length > 0
  return nameOk && isValidEmail(newParticipantEmail.value)
})

const isEditFormValid = computed(() => {
  const nameOk = newParticipantName.value.trim().length > 0
  return nameOk && isListModeValid.value
})

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

function closeAccessLinkModal() {
  showAccessLinkModal.value = false
  latestAccessLink.value = ''
}

function selectAccessLink() {
  accessLinkInput.value?.focus()
  accessLinkInput.value?.select()
}

function openAccessLinkModal(link: string) {
  latestAccessLink.value = link
  showAccessLinkModal.value = true
  void nextTick(() => {
    selectAccessLink()
  })
}

async function copyAccessLinkFromModal() {
  if (!latestAccessLink.value) return
  await copyToClipboard(latestAccessLink.value)
  selectAccessLink()
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
  editName.value = exchange.value.name
  editDescription.value = exchange.value.description || ''
  editStatus.value = exchange.value.status || 'active'
  editNoMutualAssignments.value = exchange.value.noMutualAssignments ?? false
  showEditExchangeModal.value = true
}

async function saveEdit() {
  if (!exchange.value) return
  try {
    await exchangesStore.updateExchange(exchange.value.id, {
      name: editName.value,
      description: editDescription.value,
      noMutualAssignments: editNoMutualAssignments.value,
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
  newParticipantName.value = ''
  newParticipantEmail.value = ''
  newParticipantWishlistList.value = []
  newParticipantNote.value = ''
  showAddParticipantModal.value = true
}

function openEditParticipantModal(participant: ParticipantDto) {
  editingParticipant.value = participant
  newParticipantName.value = participant.name
  newParticipantEmail.value = participant.email || ''
  newParticipantWishlistList.value = [...(participant.wishlist || [])]
  newParticipantNote.value = participant.note || ''
  showEditParticipantModal.value = true
}

async function addParticipant() {
  if (!exchange.value) return
  try {
    const result = await api.post<{ participant: ParticipantDto; accessLink: string }>(
      `/api/exchanges/${exchange.value.id}/participants`,
      {
        name: newParticipantName.value,
        email: newParticipantEmail.value,
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

async function updateParticipant() {
  if (!editingParticipant.value || !exchange.value) return
  try {
    await api.put(
      `/api/exchanges/${exchange.value.id}/participants/${editingParticipant.value.id}`,
      {
        name: newParticipantName.value,
        email: newParticipantEmail.value,
        wishlist: newParticipantWishlistList.value,
        note: newParticipantNote.value,
      },
    )
    showEditParticipantModal.value = false
    editingParticipant.value = null
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function moveSuggestionUp(idx: number) {
  const arr = newParticipantWishlistList.value
  if (idx <= 0 || idx >= arr.length) return
  const prev = arr[idx - 1]
  const curr = arr[idx]
  if (!prev || !curr) return
  arr[idx - 1] = curr
  arr[idx] = prev
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function moveSuggestionDown(idx: number) {
  const arr = newParticipantWishlistList.value
  if (idx < 0 || idx >= arr.length - 1) return
  const next = arr[idx + 1]
  const curr = arr[idx]
  if (!next || !curr) return
  arr[idx + 1] = curr
  arr[idx] = next
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
  <section class="py-4">
    <div v-if="isLoading">{{ t('exchangeDetail.loading') }}</div>
    <div v-else-if="error">{{ error }}</div>
    <div v-else-if="exchange">
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
            <b>{{ t('exchangeDetail.eventDate') }} :</b> {{ exchange.eventDate }}
          </li>
          <li v-if="exchange.budget">
            <b>{{ t('exchangeDetail.budget') }} :</b> {{ exchange.budget }}
            {{ exchange.budgetCurrency }}
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
        <button class="btn btn-warning me-2" @click="startEdit">
          {{ t('exchangeDetail.edit') }}
        </button>
        <button
          class="btn btn-success me-2"
          :disabled="!canTriggerDraw || isDrawActionLoading"
          @click="triggerDraw"
        >
          {{ t('exchangeDetail.triggerDraw') }}
        </button>
        <button
          class="btn btn-outline-warning me-2"
          :disabled="!canCancelDraw || isDrawActionLoading"
          @click="cancelDraw"
        >
          {{ t('exchangeDetail.cancelDraw') }}
        </button>
        <button class="btn btn-danger" @click="handleDelete">
          {{ t('exchangeDetail.delete') }}
        </button>
      </div>
      <div v-if="exchange.participants && exchange.participants.length">
        <h3>{{ t('exchangeDetail.participants') }}</h3>
        <button class="btn btn-primary mb-3" @click="openAddParticipantModal">
          {{ t('exchangeDetail.addParticipant') }}
        </button>
        <ul class="list-group">
          <li
            v-for="participant in participants"
            :key="participant.id"
            class="list-group-item d-flex justify-content-between align-items-center"
          >
            <div>
              <strong>{{ participant.name }}</strong>
              <span v-if="participant.email" class="text-muted"> ({{ participant.email }})</span>
              <div v-if="participant.wishlist?.length" class="small">
                <span class="me-1">{{ t('exchangeDetail.wishlist') }}:</span>
                <span class="badge text-bg-light"
                  >{{ participant.wishlist.length }} suggestions</span
                >
              </div>
              <div v-if="participant.note" class="small">
                {{ t('exchangeDetail.note') }}: {{ participant.note }}
              </div>
              <div class="small mt-2">
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
                <div class="d-flex gap-2 align-items-center" v-if="participant.status === 'active'">
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
            <div>
              <button
                class="btn btn-sm btn-outline-primary me-2"
                @click="openEditParticipantModal(participant)"
              >
                {{ t('exchangeDetail.edit') }}
              </button>
              <button
                class="btn btn-sm btn-outline-secondary me-2"
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

      <!-- Modale pour modifier l'échange -->
      <BaseModal
        :model-value="showEditExchangeModal"
        :title="t('exchangeDetail.editExchangeModal.title')"
        @update:model-value="(value) => (showEditExchangeModal = value)"
      >
        <form id="editExchangeForm" @submit.prevent="saveEdit">
          <div class="mb-3">
            <label for="editExchangeName" class="form-label">{{ t('exchangeDetail.name') }}</label>
            <input
              v-model="editName"
              type="text"
              class="form-control"
              id="editExchangeName"
              required
            />
          </div>
          <div class="mb-3">
            <label for="editExchangeDescription" class="form-label">{{
              t('exchangeDetail.description')
            }}</label>
            <input
              v-model="editDescription"
              type="text"
              class="form-control"
              id="editExchangeDescription"
            />
          </div>
          <div class="mb-3">
            <label for="editExchangeStatus" class="form-label">{{
              t('exchangeDetail.status')
            }}</label>
            <select v-model="editStatus" class="form-select" id="editExchangeStatus">
              <option value="active">{{ t('exchangeDetail.active') }}</option>
              <option value="inactive">{{ t('exchangeDetail.inactive') }}</option>
            </select>
          </div>
          <div class="mb-3 form-check">
            <input
              id="editNoMutualAssignments"
              v-model="editNoMutualAssignments"
              type="checkbox"
              class="form-check-input"
            />
            <label class="form-check-label" for="editNoMutualAssignments">
              {{ t('exchangeDetail.noMutualAssignments') }}
            </label>
          </div>
        </form>

        <template #footer>
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
            {{ t('actions.cancel') }}
          </button>
          <button type="submit" class="btn btn-primary" form="editExchangeForm">
            {{ t('exchangeDetail.editExchangeModal.submit') }}
          </button>
        </template>
      </BaseModal>

      <!-- Modale pour ajouter un participant -->
      <BaseModal
        :model-value="showAddParticipantModal"
        :title="t('exchangeDetail.addModal.title')"
        @update:model-value="(value) => (showAddParticipantModal = value)"
      >
        <form id="addParticipantForm" @submit.prevent="addParticipant">
          <div class="mb-3">
            <label for="participantName" class="form-label">{{
              t('exchangeDetail.addModal.name')
            }}</label>
            <input
              v-model="newParticipantName"
              type="text"
              class="form-control"
              id="participantName"
              required
            />
          </div>
          <div class="mb-3">
            <label for="participantEmail" class="form-label">{{
              t('exchangeDetail.addModal.email')
            }}</label>
            <input
              v-model="newParticipantEmail"
              type="email"
              class="form-control"
              id="participantEmail"
            />
          </div>
        </form>

        <template #footer>
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
            {{ t('actions.cancel') }}
          </button>
          <button
            type="submit"
            class="btn btn-primary"
            form="addParticipantForm"
            :disabled="!isAddFormValid"
          >
            {{ t('exchangeDetail.addModal.submit') }}
          </button>
        </template>
      </BaseModal>

      <!-- Modale pour modifier un participant -->
      <BaseModal
        :model-value="showEditParticipantModal"
        :title="t('exchangeDetail.editModal.title')"
        @update:model-value="(value) => (showEditParticipantModal = value)"
      >
        <form id="editParticipantForm" @submit.prevent="updateParticipant">
          <div class="mb-3">
            <label for="editParticipantName" class="form-label">{{
              t('exchangeDetail.addModal.name')
            }}</label>
            <input
              v-model="newParticipantName"
              type="text"
              class="form-control"
              id="editParticipantName"
              required
            />
          </div>
          <div class="mb-3">
            <label for="editParticipantEmail" class="form-label">{{
              t('exchangeDetail.addModal.email')
            }}</label>
            <input
              v-model="newParticipantEmail"
              type="email"
              class="form-control"
              id="editParticipantEmail"
            />
          </div>
          <div class="mb-3">
            <label class="form-label mb-0">{{ t('exchangeDetail.addModal.wishlist') }}</label>
            <div class="mt-2">
              <Draggable
                v-model="newParticipantWishlistList"
                handle=".drag-handle"
                :animation="200"
              >
                <template #item="{ element: s, index: idx }">
                  <WishlistSuggestionItem
                    :modelValue="s"
                    @update:modelValue="(v) => newParticipantWishlistList.splice(idx, 1, v)"
                    mode="edit"
                    :removable="true"
                    :showHandle="true"
                    :asListItem="true"
                    @remove="newParticipantWishlistList.splice(idx, 1)"
                  />
                </template>
              </Draggable>
              <button
                type="button"
                class="btn btn-sm btn-outline-primary"
                @click="newParticipantWishlistList.push({ title: '' })"
              >
                <i class="bi bi-plus-lg"></i> Ajouter une suggestion
              </button>
            </div>
          </div>
          <div class="mb-3">
            <label for="editParticipantNote" class="form-label">{{
              t('exchangeDetail.addModal.note')
            }}</label>
            <textarea
              v-model="newParticipantNote"
              class="form-control"
              id="editParticipantNote"
            ></textarea>
          </div>
        </form>

        <template #footer>
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
            {{ t('actions.cancel') }}
          </button>
          <button
            type="submit"
            class="btn btn-primary"
            form="editParticipantForm"
            :disabled="!isEditFormValid"
          >
            {{ t('exchangeDetail.editModal.submit') }}
          </button>
        </template>
      </BaseModal>

      <!-- Modale d'affichage du lien d'accès participant -->
      <BaseModal
        :model-value="showAccessLinkModal"
        :title="t('exchangeDetail.linkModal.title')"
        @update:model-value="(value) => (showAccessLinkModal = value)"
      >
        <p class="mb-2">{{ t('exchangeDetail.linkModal.description') }}</p>
        <input
          ref="accessLinkInput"
          :value="latestAccessLink"
          type="text"
          class="form-control"
          readonly
          @focus="selectAccessLink"
        />

        <template #footer>
          <button type="button" class="btn btn-secondary" @click="closeAccessLinkModal">
            {{ t('exchangeDetail.linkModal.close') }}
          </button>
          <button type="button" class="btn btn-primary" @click="copyAccessLinkFromModal">
            {{ t('exchangeDetail.linkModal.copy') }}
          </button>
        </template>
      </BaseModal>
    </div>
  </section>
</template>
