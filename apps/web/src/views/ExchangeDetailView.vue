<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
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
import { HttpError } from '@/composables/useApi'
import { useAdminAuthStore } from '@/stores/useAdminAuthStore'

const api = useApi()
const toasts = useToastsStore()
const adminAuthStore = useAdminAuthStore()

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const exchangesStore = useExchangesStore()
const exchange = ref<ExchangeDto | null>(null)
const participants = ref<ParticipantDto[]>([])
const exclusionRules = ref<ExclusionRule[]>([])
const selectedExceptionReceiverByParticipant = ref<Record<string, string>>({})
const isLoading = ref(true)
const error = ref<string | null>(null)
const requiresAdminAuth = ref(false)
const adminPassword = ref('')
const isAuthenticatingAdmin = ref(false)
const showEditExchangeModal = ref(false)
const isSavingExchange = ref(false)
const isDrawActionLoading = ref(false)
const isLoggingOutAdmin = ref(false)
const isChangingAdminPassword = ref(false)
const currentAdminPassword = ref('')
const newAdminPassword = ref('')
const confirmAdminPassword = ref('')
const POLL_INTERVAL_MS = 5000
let pollTimer: ReturnType<typeof setInterval> | null = null
const isPolling = ref(false)

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

const detailMode = ref<'summary' | 'detail'>('summary')

const isSummaryMode = computed(() => detailMode.value === 'summary')
const isDetailMode = computed({
  get: () => detailMode.value === 'detail',
  set: (value: boolean) => {
    detailMode.value = value ? 'detail' : 'summary'
  },
})

const canTriggerDraw = computed(() => {
  if (!exchange.value) return false
  return exchange.value.status === 'draft' || exchange.value.status === 'ready'
})

const canCancelDraw = computed(() => {
  if (!exchange.value) return false
  return exchange.value.status === 'drawn'
})

const isParticipantCreationLocked = computed(() => {
  if (!exchange.value) return true
  return exchange.value.status === 'drawn' || exchange.value.status === 'archived'
})

const participantCountLabel = computed(() => String(participants.value.length))

const publicExchangeLink = computed(() => {
  if (!exchange.value) return ''
  return router.resolve({
    name: 'exchange-public',
    params: { id: exchange.value.id },
  }).href
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

function resolveParticipantAccessLink(link: string) {
  const trimmed = link.trim()
  if (!trimmed) return ''

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed
  }

  return new URL(trimmed, window.location.origin).toString()
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
  latestAccessLink.value = resolveParticipantAccessLink(link)
  showAccessLinkModal.value = true
}

async function copyAccessLinkFromModal() {
  if (!latestAccessLink.value) return
  await copyToClipboard(latestAccessLink.value)
}

async function fetchExchangeData() {
  const id = route.params.id as string
  const token = adminAuthStore.getSessionToken(id)
  const init: RequestInit | undefined = token
    ? {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    : undefined

  const [exchangeResponse, participantsResponse, exclusionsResponse] = await Promise.all([
    api.get<ExchangeDto>(`/api/exchanges/${id}`, init),
    api.get<ParticipantDto[]>(`/api/exchanges/${id}/participants`, init),
    api.get<ExclusionRule[]>(`/api/exchanges/${id}/exclusions`, init),
  ])
  return { exchangeResponse, participantsResponse, exclusionsResponse }
}

function isAdminAuthError(error: unknown): boolean {
  return (
    error instanceof HttpError &&
    error.status === 401 &&
    error.code === 'ADMIN_SESSION_INVALID_OR_EXPIRED'
  )
}

function setAdminAuthRequired() {
  const exchangeId = route.params.id as string
  adminAuthStore.clearSession(exchangeId)
  requiresAdminAuth.value = true
  error.value = t('exchangeDetail.adminAuth.required')
}

async function fetchExchange() {
  isLoading.value = true
  error.value = null
  try {
    const { exchangeResponse, participantsResponse, exclusionsResponse } = await fetchExchangeData()
    requiresAdminAuth.value = false
    exchange.value = exchangeResponse
    participants.value = participantsResponse
    exclusionRules.value = exclusionsResponse
  } catch (err) {
    if (isAdminAuthError(err)) {
      setAdminAuthRequired()
      return
    }

    const message = getApiErrorMessage(err)
    error.value = message
    toasts.error(message)
  } finally {
    isLoading.value = false
  }
}

async function pollExchangeIfIdle() {
  if (
    document.hidden ||
    isLoading.value ||
    isPolling.value ||
    requiresAdminAuth.value ||
    !exchange.value ||
    showEditExchangeModal.value ||
    showAddParticipantModal.value ||
    showEditParticipantModal.value ||
    showAccessLinkModal.value
  ) {
    return
  }

  isPolling.value = true
  try {
    const { exchangeResponse, participantsResponse, exclusionsResponse } = await fetchExchangeData()
    requiresAdminAuth.value = false
    // N'actualiser les refs que si les données ont réellement changé pour éviter les re-renders inutiles
    if (JSON.stringify(exchangeResponse) !== JSON.stringify(exchange.value)) {
      exchange.value = exchangeResponse
    }
    if (JSON.stringify(participantsResponse) !== JSON.stringify(participants.value)) {
      participants.value = participantsResponse
    }
    if (JSON.stringify(exclusionsResponse) !== JSON.stringify(exclusionRules.value)) {
      exclusionRules.value = exclusionsResponse
    }
  } catch {
    // Erreurs de polling ignorées silencieusement
  } finally {
    isPolling.value = false
  }
}

function stopPolling() {
  if (!pollTimer) return
  clearInterval(pollTimer)
  pollTimer = null
}

function startPolling() {
  stopPolling()
  if (document.hidden) return

  pollTimer = setInterval(() => {
    void pollExchangeIfIdle()
  }, POLL_INTERVAL_MS)
}

function handleVisibilityChange() {
  if (document.hidden) {
    stopPolling()
    return
  }

  void pollExchangeIfIdle()
  startPolling()
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
    const exchangeId = exchange.value.id
    const token = adminAuthStore.getSessionToken(exchangeId)
    const init = token
      ? {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      : undefined

    const createdRule = await api.post<ExclusionRule>(
      `/api/exchanges/${exchange.value.id}/exclusions`,
      {
        giverParticipantId,
        receiverParticipantId,
      },
      init,
    )

    exclusionRules.value.push(createdRule)
    selectedExceptionReceiverByParticipant.value[giverParticipantId] = ''
    toasts.success(t('exchangeDetail.exceptions.added'))
  } catch (err) {
    if (isAdminAuthError(err)) {
      setAdminAuthRequired()
      return
    }
    toasts.error(getApiErrorMessage(err, { fallbackKey: 'exchangeDetail.exceptions.addFailed' }))
  }
}

async function removeParticipantExclusion(ruleId: string) {
  if (!exchange.value || isExclusionEditingLocked.value) return

  try {
    const exchangeId = exchange.value.id
    const token = adminAuthStore.getSessionToken(exchangeId)
    const init = token
      ? {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      : undefined

    await api.delete(`/api/exchanges/${exchange.value.id}/exclusions/${ruleId}`, init)
    exclusionRules.value = exclusionRules.value.filter((rule) => rule.id !== ruleId)
    toasts.success(t('exchangeDetail.exceptions.removed'))
  } catch (err) {
    if (isAdminAuthError(err)) {
      setAdminAuthRequired()
      return
    }
    toasts.error(getApiErrorMessage(err, { fallbackKey: 'exchangeDetail.exceptions.removeFailed' }))
  }
}

async function authenticateAdmin() {
  const exchangeId = route.params.id as string
  if (!adminPassword.value.trim() || isAuthenticatingAdmin.value) return

  isAuthenticatingAdmin.value = true
  error.value = null

  try {
    const result = await api.post<{ adminSessionToken: string }, { adminPassword: string }>(
      `/api/exchanges/${exchangeId}/admin/sessions`,
      { adminPassword: adminPassword.value },
    )

    adminAuthStore.setSession(exchangeId, result.adminSessionToken)
    adminPassword.value = ''
    requiresAdminAuth.value = false
    await fetchExchange()
  } catch (err) {
    const message = getApiErrorMessage(err, {
      fallbackKey: 'exchangeDetail.adminAuth.loginFailed',
    })
    error.value = message
    toasts.error(message)
  } finally {
    isAuthenticatingAdmin.value = false
  }
}

async function changeAdminPassword() {
  if (!exchange.value || isChangingAdminPassword.value) return
  if (!currentAdminPassword.value || !newAdminPassword.value) return

  if (newAdminPassword.value !== confirmAdminPassword.value) {
    toasts.error(t('exchangeDetail.adminAuth.passwordMismatch'))
    return
  }

  isChangingAdminPassword.value = true

  try {
    const exchangeId = exchange.value.id
    const token = adminAuthStore.getSessionToken(exchangeId)
    const init = token
      ? {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      : undefined

    await api.put(
      `/api/exchanges/${exchangeId}/admin/password`,
      {
        currentPassword: currentAdminPassword.value,
        newPassword: newAdminPassword.value,
      },
      init,
    )

    currentAdminPassword.value = ''
    newAdminPassword.value = ''
    confirmAdminPassword.value = ''
    toasts.success(t('exchangeDetail.adminAuth.passwordUpdated'))
  } catch (err) {
    if (isAdminAuthError(err)) {
      setAdminAuthRequired()
      return
    }

    toasts.error(
      getApiErrorMessage(err, { fallbackKey: 'exchangeDetail.adminAuth.passwordChangeFailed' }),
    )
  } finally {
    isChangingAdminPassword.value = false
  }
}

async function logoutAdmin() {
  if (!exchange.value || isLoggingOutAdmin.value) return

  isLoggingOutAdmin.value = true

  try {
    const exchangeId = exchange.value.id
    const token = adminAuthStore.getSessionToken(exchangeId)
    const init = token
      ? {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      : undefined

    if (token) {
      await api.delete(`/api/exchanges/${exchangeId}/admin/sessions/current`, init)
    }
  } catch {
    // Even if server-side revocation fails, clear local session and force re-auth.
  } finally {
    const exchangeId = route.params.id as string
    adminAuthStore.clearSession(exchangeId)
    requiresAdminAuth.value = true
    error.value = t('exchangeDetail.adminAuth.required')
    toasts.success(t('exchangeDetail.adminAuth.loggedOut'))
    isLoggingOutAdmin.value = false
  }
}

onMounted(() => {
  // S'assurer que les modales ne sont jamais ouvertes au chargement
  showAddParticipantModal.value = false
  showEditParticipantModal.value = false
  editingParticipant.value = null
  fetchExchange()
  document.addEventListener('visibilitychange', handleVisibilityChange)
  startPolling()
})

onUnmounted(() => {
  stopPolling()
  document.removeEventListener('visibilitychange', handleVisibilityChange)
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
  if (!exchange.value || isSavingExchange.value) return
  isSavingExchange.value = true
  const currentUpdatedAt = exchange.value.updatedAt
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
      expectedUpdatedAt: currentUpdatedAt,
    })
    showEditExchangeModal.value = false
    await fetchExchange()
  } catch (err) {
    if (isAdminAuthError(err)) {
      setAdminAuthRequired()
      return
    }

    console.error(err)
  } finally {
    isSavingExchange.value = false
  }
}

async function handleDelete() {
  if (!exchange.value) return
  if (!confirm(t('exchangeDetail.confirmDeleteExchange'))) return
  try {
    await exchangesStore.deleteExchange(exchange.value.id)
    window.location.href = '/exchanges'
  } catch (err) {
    if (isAdminAuthError(err)) {
      setAdminAuthRequired()
      return
    }

    console.error(err)
    toasts.error(getApiErrorMessage(err, { fallbackMessage: 'Erreur lors de la modification' }))
  }
}

// Fonctions pour les participants
function openAddParticipantModal() {
  if (isParticipantCreationLocked.value) return
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
  if (!exchange.value || isParticipantCreationLocked.value) return
  try {
    const exchangeId = exchange.value.id
    const token = adminAuthStore.getSessionToken(exchangeId)
    const init = token
      ? {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      : undefined

    await api.post<{ participant: ParticipantDto; accessLink: string }>(
      `/api/exchanges/${exchange.value.id}/participants`,
      {
        name: payload.name,
        email: payload.email,
      },
      init,
    )
    showAddParticipantModal.value = false
    await fetchExchange()
  } catch (err) {
    if (isAdminAuthError(err)) {
      setAdminAuthRequired()
      return
    }

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
  const participantId = editingParticipant.value.id
  const participantUpdatedAt = editingParticipant.value.updatedAt
  try {
    const exchangeId = exchange.value.id
    const token = adminAuthStore.getSessionToken(exchangeId)
    const init = token
      ? {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      : undefined

    await api.put(
      `/api/exchanges/${exchange.value.id}/participants/${participantId}`,
      {
        name: payload.name,
        email: payload.email,
        wishlist: payload.wishlist,
        note: payload.note,
        expectedUpdatedAt: participantUpdatedAt,
      },
      init,
    )
    setEditParticipantModalVisibility(false)
    await fetchExchange()
  } catch (err) {
    if (isAdminAuthError(err)) {
      setAdminAuthRequired()
      return
    }

    console.error(err)
  }
}

async function deleteParticipant(participantId: string) {
  if (!exchange.value) return
  if (!confirm(t('exchangeDetail.confirmDeleteParticipant'))) return
  try {
    const exchangeId = exchange.value.id
    const token = adminAuthStore.getSessionToken(exchangeId)
    const init = token
      ? {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      : undefined

    await api.delete(`/api/exchanges/${exchange.value.id}/participants/${participantId}`, init)
    await fetchExchange()
  } catch (err) {
    if (isAdminAuthError(err)) {
      setAdminAuthRequired()
      return
    }

    console.error(err)
    toasts.error(getApiErrorMessage(err, { fallbackMessage: 'Erreur lors de la suppression' }))
  }
}

async function regenerateParticipantLink(participantId: string) {
  if (!exchange.value) return
  try {
    const exchangeId = exchange.value.id
    const token = adminAuthStore.getSessionToken(exchangeId)
    const init = token
      ? {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      : undefined

    const payload = { revokeExisting: true }
    const result = await api.post<{ participantId: string; accessLink: string }, typeof payload>(
      `/api/exchanges/${exchange.value.id}/participants/${participantId}/access/regenerate`,
      payload,
      init,
    )
    if (result?.accessLink) {
      const resolvedAccessLink = resolveParticipantAccessLink(result.accessLink)
      await copyToClipboard(resolvedAccessLink)
      openAccessLinkModal(resolvedAccessLink)
    }
  } catch (err) {
    if (isAdminAuthError(err)) {
      setAdminAuthRequired()
      return
    }

    console.error(err)
    toasts.error(getApiErrorMessage(err, { fallbackKey: 'exchangeDetail.generateFailed' }))
  }
}

async function triggerDraw() {
  if (!exchange.value || !canTriggerDraw.value || isDrawActionLoading.value) return
  if (!confirm(t('exchangeDetail.confirmTriggerDraw'))) return

  isDrawActionLoading.value = true
  try {
    const exchangeId = exchange.value.id
    const token = adminAuthStore.getSessionToken(exchangeId)
    const init = token
      ? {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      : undefined

    await api.post(`/api/exchanges/${exchange.value.id}/draw`, undefined, init)
    toasts.success(t('exchangeDetail.drawSuccess'))
    await fetchExchange()
  } catch (err) {
    if (isAdminAuthError(err)) {
      setAdminAuthRequired()
      return
    }

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
    const exchangeId = exchange.value.id
    const token = adminAuthStore.getSessionToken(exchangeId)
    const init = token
      ? {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      : undefined

    await api.post(`/api/exchanges/${exchange.value.id}/draw/cancel`, undefined, init)
    toasts.success(t('exchangeDetail.cancelDrawSuccess'))
    await fetchExchange()
  } catch (err) {
    if (isAdminAuthError(err)) {
      setAdminAuthRequired()
      return
    }

    toasts.error(getApiErrorMessage(err, { fallbackKey: 'exchangeDetail.cancelDrawFailed' }))
  } finally {
    isDrawActionLoading.value = false
  }
}
</script>

<template>
  <section id="exchange-detail-view">
    <div v-if="requiresAdminAuth" class="card border shadow-sm mb-3">
      <div class="card-body">
        <h3 class="h5 mb-2">{{ t('exchangeDetail.adminAuth.title') }}</h3>
        <p class="text-muted mb-3">{{ t('exchangeDetail.adminAuth.description') }}</p>
        <form class="row g-2 align-items-end" @submit.prevent="authenticateAdmin">
          <div class="col-12 col-md-8">
            <label for="exchange-admin-password" class="form-label mb-1">{{
              t('exchangeDetail.adminAuth.passwordLabel')
            }}</label>
            <input
              id="exchange-admin-password"
              v-model="adminPassword"
              class="form-control"
              type="password"
              autocomplete="current-password"
              required
            />
          </div>
          <div class="col-12 col-md-4 d-grid">
            <button class="btn btn-primary" type="submit" :disabled="isAuthenticatingAdmin">
              {{
                isAuthenticatingAdmin
                  ? t('exchangeDetail.adminAuth.loggingIn')
                  : t('exchangeDetail.adminAuth.login')
              }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <div v-if="isLoading">{{ t('exchangeDetail.loading') }}</div>
    <div v-else-if="error">{{ error }}</div>
    <div v-else-if="exchange" class="kado-exchange-layout d-md-flex gap-4">
      <!-- Détails de l'échange -->
      <section id="detail" class="kado-panel">
        <div class="card border shadow-sm">
          <div class="card-body">
            <div class="kado-hero mb-3">
              <div>
                <h2 class="kado-title mb-1">{{ exchange.name }}</h2>
                <p class="kado-subtitle mb-0">
                  {{ participantCountLabel }} {{ t('exchangeDetail.participants') }} •
                  {{ statusLabel }}
                </p>
              </div>
              <router-link
                class="btn btn-sm btn-outline-primary kado-share"
                :to="{ name: 'exchange-public', params: { id: exchange.id } }"
              >
                {{ t('exchangeDetail.share') }}
              </router-link>
            </div>

            <div class="d-flex align-items-center gap-2 mb-3">
              <span class="small text-muted">{{ t('exchangeDetail.viewMode.summary') }}</span>
              <div class="form-check form-switch mb-0">
                <input
                  id="exchange-view-mode-switch"
                  v-model="isDetailMode"
                  class="form-check-input"
                  type="checkbox"
                  role="switch"
                  :aria-label="t('exchangeDetail.viewMode.label')"
                />
              </div>
              <span class="small text-muted">{{ t('exchangeDetail.viewMode.detail') }}</span>
            </div>

            <p v-if="exchange.description">{{ exchange.description }}</p>
            <ul>
              <li>
                <b>{{ t('exchangeDetail.organizer') }} :</b> {{ exchange.organizerName }}
              </li>
              <li>
                <b>{{ t('exchangeDetail.status') }} :</b>
                <span class="badge ms-1" :class="statusBadgeClass">{{ statusLabel }}</span>
              </li>
              <li>
                <b>{{ t('exchangeDetail.participants') }} :</b>
                {{ participantCountLabel }}
              </li>
              <li v-if="exchange.drawDeadlineAt">
                <b>{{ t('exchangeDetail.drawDeadlineAt') }} :</b>
                {{ new Date(exchange.drawDeadlineAt).toLocaleString() }}
              </li>
              <li>
                <b>{{ t('exchangeDetail.minWishlistSuggestions') }} :</b>
                {{ exchange.minWishlistSuggestions ?? 0 }}
              </li>

              <template v-if="!isSummaryMode">
                <li v-if="exchange.eventDate">
                  <b>{{ t('exchangeDetail.exchangeMoment') }} :</b> {{ exchange.eventDate }}
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
              </template>
            </ul>

            <div class="d-flex flex-wrap gap-2 mb-2">
              <button class="btn btn-warning" @click="startEdit">
                {{ t('exchangeDetail.edit') }}
              </button>
              <button
                v-if="canTriggerDraw"
                class="btn btn-primary"
                :disabled="isDrawActionLoading"
                @click="triggerDraw"
              >
                {{ t('exchangeDetail.triggerDraw') }}
              </button>
              <button
                v-else-if="canCancelDraw"
                class="btn btn-outline-warning"
                :disabled="isDrawActionLoading"
                @click="cancelDraw"
              >
                {{ t('exchangeDetail.cancelDraw') }}
              </button>
              <button
                class="btn btn-outline-secondary"
                :disabled="isLoggingOutAdmin"
                @click="logoutAdmin"
              >
                {{
                  isLoggingOutAdmin
                    ? t('exchangeDetail.adminAuth.loggingOut')
                    : t('exchangeDetail.adminAuth.logout')
                }}
              </button>
            </div>

            <div v-if="exchange.status === 'drawn'" class="kado-draw-result mb-2">
              <span class="kado-draw-result-icon" aria-hidden="true">✔</span>
              <span>{{ t('exchangeDetail.drawSuccess') }}</span>
              <router-link :to="{ name: 'exchange-public', params: { id: exchange.id } }">
                {{ t('exchangeDetail.openPublicView') }}
              </router-link>
            </div>

            <div v-if="!isSummaryMode">
              <button class="btn btn-danger" @click="handleDelete">
                {{ t('exchangeDetail.delete') }}
              </button>
            </div>

            <div class="card border mt-3">
              <div class="card-body">
                <details>
                  <summary>
                    <span class="h5">{{ t('exchangeDetail.adminAuth.changePasswordTitle') }}</span>
                  </summary>

                  <p class="small text-muted mb-3">
                    {{ t('exchangeDetail.adminAuth.changePasswordDescription') }}
                  </p>

                  <div class="small mb-2" v-if="publicExchangeLink">
                    <b>{{ t('exchangeDetail.adminAuth.publicLinkLabel') }}:</b>
                    <a :href="publicExchangeLink">{{ publicExchangeLink }}</a>
                  </div>

                  <form class="row g-2" @submit.prevent="changeAdminPassword">
                    <div class="col-12">
                      <label for="current-admin-password" class="form-label">
                        {{ t('exchangeDetail.adminAuth.currentPasswordLabel') }}
                      </label>
                      <input
                        id="current-admin-password"
                        v-model="currentAdminPassword"
                        type="password"
                        class="form-control"
                        minlength="10"
                        required
                      />
                    </div>
                    <div class="col-12 col-md-6">
                      <label for="new-admin-password" class="form-label">
                        {{ t('exchangeDetail.adminAuth.newPasswordLabel') }}
                      </label>
                      <input
                        id="new-admin-password"
                        v-model="newAdminPassword"
                        type="password"
                        class="form-control"
                        minlength="10"
                        required
                      />
                    </div>
                    <div class="col-12 col-md-6">
                      <label for="confirm-admin-password" class="form-label">
                        {{ t('exchangeDetail.adminAuth.confirmPasswordLabel') }}
                      </label>
                      <input
                        id="confirm-admin-password"
                        v-model="confirmAdminPassword"
                        type="password"
                        class="form-control"
                        minlength="10"
                        required
                      />
                    </div>
                    <div class="col-12 d-grid d-md-flex justify-content-md-end">
                      <button
                        class="btn btn-outline-secondary"
                        type="submit"
                        :disabled="isChangingAdminPassword"
                      >
                        {{
                          isChangingAdminPassword
                            ? t('exchangeDetail.adminAuth.changingPassword')
                            : t('exchangeDetail.adminAuth.changePassword')
                        }}
                      </button>
                    </div>
                  </form>
                </details>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Participants -->
      <section id="participants" class="kado-panel">
        <div v-if="participants.length" class="card border shadow-sm">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <h3>{{ t('exchangeDetail.participants') }} ({{ participants.length }})</h3>
              <button
                class="btn btn-sm btn-outline-primary"
                :disabled="isParticipantCreationLocked"
                @click="openAddParticipantModal"
              >
                + {{ t('exchangeDetail.addParticipant') }}
              </button>
            </div>

            <ul class="list-group">
              <li
                v-for="participant in participants"
                :key="participant.id"
                class="list-group-item participant-row kado-participant-row d-flex justify-content-between align-items-start"
              >
                <div class="participant-main">
                  <strong class="participant-name">{{ participant.name }}</strong>
                  <!-- <span v-if="participant.email" class="text-muted"> ({{ participant.email }})</span> -->

                  <div v-if="participant.wishlist?.length" class="small mt-1">
                    <!-- <span class="me-1">{{ t('exchangeDetail.wishlist') }}:</span> -->
                    <span class="badge text-bg-light">{{
                      t('exchangeDetail.wishlistSuggestions', participant.wishlist.length)
                    }}</span>
                  </div>

                  <div v-if="!isSummaryMode && participant.note" class="small mt-1">
                    {{ t('exchangeDetail.note') }}: {{ participant.note }}
                  </div>

                  <div v-if="!isSummaryMode" class="participant-exceptions">
                    <div class="participant-exceptions-header">
                      <span class="fw-semibold">{{ t('exchangeDetail.exceptions.title') }}</span>
                      <span class="badge text-bg-light">
                        {{ getParticipantExclusions(participant.id).length }}
                      </span>
                    </div>

                    <ul
                      v-if="getParticipantExclusions(participant.id).length"
                      class="participant-exceptions-list list-unstyled"
                    >
                      <li
                        v-for="rule in getParticipantExclusions(participant.id)"
                        :key="rule.id"
                        class="participant-exception-item"
                      >
                        <span>
                          {{ t('exchangeDetail.exceptions.cannotDraw') }}
                          <strong>
                            {{
                              participantNameById[rule.receiverParticipantId] ||
                              rule.receiverParticipantId
                            }}
                          </strong>
                        </span>
                        <button
                          type="button"
                          class="btn btn-sm btn-outline-danger btn-icon"
                          :disabled="isExclusionEditingLocked"
                          :aria-label="t('exchangeDetail.exceptions.remove')"
                          :title="t('exchangeDetail.exceptions.remove')"
                          @click="removeParticipantExclusion(rule.id)"
                        >
                          <i class="bi bi-x-lg" aria-hidden="true"></i>
                          <span class="visually-hidden">{{
                            t('exchangeDetail.exceptions.remove')
                          }}</span>
                        </button>
                      </li>
                    </ul>

                    <p v-else class="mb-2 text-muted small">
                      {{ t('exchangeDetail.exceptions.none') }}
                    </p>

                    <div class="participant-exception-form" v-if="participant.status === 'active'">
                      <select
                        class="form-select form-select-sm"
                        :disabled="
                          isExclusionEditingLocked || !getReceiverCandidates(participant.id).length
                        "
                        v-model="selectedExceptionReceiverByParticipant[participant.id]"
                      >
                        <option value="">
                          {{ t('exchangeDetail.exceptions.selectReceiver') }}
                        </option>
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
                        class="btn btn-sm btn-outline-primary btn-icon"
                        :disabled="
                          isExclusionEditingLocked ||
                          !selectedExceptionReceiverByParticipant[participant.id]
                        "
                        :aria-label="t('exchangeDetail.exceptions.add')"
                        :title="t('exchangeDetail.exceptions.add')"
                        @click="addParticipantExclusion(participant.id)"
                      >
                        <i class="bi bi-plus-lg" aria-hidden="true"></i>
                        <span class="visually-hidden">{{
                          t('exchangeDetail.exceptions.add')
                        }}</span>
                      </button>
                    </div>

                    <p v-if="isExclusionEditingLocked" class="mb-0 text-muted small mt-2">
                      {{ t('exchangeDetail.exceptions.locked') }}
                    </p>
                  </div>
                </div>
                <div class="participant-actions mt-2 mt-md-0">
                  <button
                    class="btn btn-sm btn-outline-primary btn-icon"
                    :aria-label="t('exchangeDetail.edit')"
                    :title="t('exchangeDetail.edit')"
                    @click="openEditParticipantModal(participant)"
                  >
                    <i class="bi bi-pencil" aria-hidden="true"></i>
                    <span class="visually-hidden">{{ t('exchangeDetail.edit') }}</span>
                  </button>
                  <button
                    class="btn btn-sm btn-outline-secondary btn-icon"
                    :aria-label="t('exchangeDetail.generateLink')"
                    :title="t('exchangeDetail.generateLink')"
                    @click="regenerateParticipantLink(participant.id)"
                  >
                    <i class="bi bi-link-45deg" aria-hidden="true"></i>
                    <span class="visually-hidden">{{ t('exchangeDetail.generateLink') }}</span>
                  </button>
                  <button
                    class="btn btn-sm btn-outline-danger btn-icon"
                    v-if="!isSummaryMode"
                    :aria-label="t('exchangeDetail.delete')"
                    :title="t('exchangeDetail.delete')"
                    @click="deleteParticipant(participant.id)"
                  >
                    <i class="bi bi-trash" aria-hidden="true"></i>
                    <span class="visually-hidden">{{ t('exchangeDetail.delete') }}</span>
                  </button>
                </div>
              </li>
            </ul>
          </div>
        </div>
        <div v-else class="card border shadow-sm">
          <div class="card-body">
            <h3>{{ t('exchangeDetail.participants') }}</h3>
            <p>
              <em>{{ t('exchangeDetail.noParticipants') }}</em>
            </p>
            <button
              class="btn btn-primary"
              :disabled="isParticipantCreationLocked"
              @click="openAddParticipantModal"
            >
              + {{ t('exchangeDetail.addParticipant') }}
            </button>
          </div>
        </div>
      </section>

      <EditExchangeModal
        :model-value="showEditExchangeModal"
        :is-submitting="isSavingExchange"
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

<style scoped lang="scss">
#exchange-detail-view {
  color: #1f4e4f;
}

.kado-exchange-layout {
  align-items: flex-start;
}

.kado-panel {
  flex: 1;
  min-width: 0;
}

#detail {
  flex: 1.35;
}

#participants {
  flex: 1;
}

.kado-hero {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
}

.kado-title {
  color: #1f4e4f;
  font-family: Manrope, 'Open Sans', sans-serif;
  font-weight: 700;
  letter-spacing: -0.5px;
}

.kado-subtitle {
  color: #866c5a;
  font-size: 0.95rem;
}

.kado-share {
  white-space: nowrap;
}

.kado-draw-result {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.35rem;
  color: #4c7a5a;
  font-weight: 600;
}

.kado-draw-result a {
  color: #2f7c7a;
  font-weight: 600;
}

.kado-draw-result-icon {
  font-size: 1.05rem;
}

.list-group {
  --bs-list-group-border-color: #d6cfc4;
  --bs-list-group-bg: #fff;
}

.kado-participant-row {
  transition: background-color 0.18s ease;
}

.kado-participant-row:hover {
  background: #f8f5ee;
}

@media (max-width: 767.98px) {
  .kado-hero {
    flex-direction: column;
    align-items: stretch;
  }

  .kado-share {
    width: 100%;
  }
}
</style>
