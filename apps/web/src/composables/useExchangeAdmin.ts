import { computed, onMounted, onUnmounted, ref, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useExchangesStore } from '@/stores/exchanges'
import type { ExchangeDto, ExclusionRule } from '@kado/shared'
import type { ParticipantDto } from '@kado/shared'
import { useI18n } from 'vue-i18n'
import { useApi } from '@/composables/useApi'
import { useToastsStore } from '@/stores/toasts'
import { getApiErrorMessage } from '@/composables/useApiErrorMessage'
import { copyText } from '@/composables/useClipboard'
import { useRefresh } from '@/composables/useRefresh'
import { useFormErrors } from '@/composables/useFormErrors'
import { confirmDiscard, useDraftGuard } from '@/composables/useDraftGuard'
import { clone } from '@/composables/useConflict'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import type { UpdateExchangeInputDto, UpdateParticipantInputDto } from '@kado/shared'
import { HttpError, isRequestAborted } from '@/composables/useApi'
import { useAdminAuthStore } from '@/stores/useAdminAuthStore'

export function useExchangeAdmin() {
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
  const maxActiveParticipants = ref<number | null>(null)
  const configError = ref<string | null>(null)
  const configLoading = ref(false)
  const mutationBusy = ref(false)
  const actionError = ref<string | null>(null)
  const addForm = useFormErrors(),
    passwordForm = useFormErrors()
  const addParticipantError = addForm.error,
    addParticipantFieldErrors = addForm.fieldErrors
  const passwordError = passwordForm.error,
    passwordFieldErrors = passwordForm.fieldErrors
  const exchangeForm = useFormErrors(),
    participantForm = useFormErrors()
  const editExchangeError = exchangeForm.error,
    editExchangeFieldErrors = exchangeForm.fieldErrors
  const editParticipantError = participantForm.error,
    editParticipantFieldErrors = participantForm.fieldErrors
  const editExchangeCurrent = ref<ExchangeDto | null>(null)
  const editParticipantCurrent = ref<ParticipantDto | null>(null)
  const exchangeDirty = ref(false),
    participantDirty = ref(false)
  async function loadConfig() {
    if (configLoading.value) return
    configLoading.value = true
    configError.value = null
    try {
      const config = await api.get<{ maxActiveParticipants: number }>('/api/config')
      maxActiveParticipants.value = config.maxActiveParticipants
    } catch (cause) {
      configError.value = getApiErrorMessage(cause)
    } finally {
      configLoading.value = false
    }
  }

  const isSavingExchange = ref(false)
  const isDrawActionLoading = ref(false)
  const isLoggingOutAdmin = ref(false)
  const isChangingAdminPassword = ref(false)
  const currentAdminPassword = ref('')
  const newAdminPassword = ref('')
  const confirmAdminPassword = ref('')

  // Pour les participants
  const showEditParticipantModal = ref(false)
  const showAccessLinkModal = ref(false)
  const editingParticipant = ref<ParticipantDto | null>(null)
  const latestAccessLink = ref('')
  const newParticipantName = ref('')
  const newParticipantEmail = ref('')
  const newParticipantNameInput = ref<HTMLInputElement | null>(null)
  const isAddingParticipant = ref(false)
  const inlineDirty = computed(() =>
    Boolean(
      newParticipantName.value ||
      newParticipantEmail.value ||
      currentAdminPassword.value ||
      newAdminPassword.value ||
      confirmAdminPassword.value,
    ),
  )
  useDraftGuard(inlineDirty)

  const isExclusionEditingLocked = computed(() => {
    if (!exchange.value) return true
    return exchange.value.isDrawn || exchange.value.isArchived
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
    return !exchange.value.isDrawn && !exchange.value.isArchived
  })

  const canCancelDraw = computed(() => {
    if (!exchange.value) return false
    return exchange.value.isDrawn && !exchange.value.isArchived
  })

  const isParticipantCreationLocked = computed(() => {
    if (!exchange.value) return true
    return (
      exchange.value.isDrawn ||
      exchange.value.isArchived ||
      maxActiveParticipants.value === null ||
      activeParticipants.value.length >= (maxActiveParticipants.value ?? 0)
    )
  })

  const isParticipantIdentityLocked = computed(
    () => !exchange.value || exchange.value.isDrawn || exchange.value.isArchived,
  )
  const isParticipantSuggestionsLocked = computed(
    () =>
      !exchange.value ||
      exchange.value.isArchived ||
      (exchange.value.isDrawn && (exchange.value.lockSuggestionsAfterDraw ?? true)),
  )
  const participantCountLabel = computed(() => String(participants.value.length))

  const publicExchangeLink = computed(() => {
    if (!exchange.value) return ''
    return router.resolve({
      name: 'exchange-public',
      params: { id: exchange.value.id },
    }).href
  })

  const statusBadgeClass = computed(() => {
    if (!exchange.value) return 'text-bg-light'
    if (exchange.value.isArchived) return 'text-bg-dark'
    if (exchange.value.isDrawn) return 'text-bg-success'
    return 'text-bg-secondary'
  })

  const statusLabel = computed(() => {
    if (!exchange.value) return '-'
    if (exchange.value.isArchived) return t('exchangeDetail.statusValues.archived')
    if (exchange.value.isDrawn) return t('exchangeDetail.statusValues.drawn')
    return t('exchangeDetail.statusValues.undrawn')
  })

  function resolveParticipantAccessLink(link: string) {
    const trimmed = link.trim()
    if (!trimmed) return ''

    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed
    }

    return new URL(trimmed, window.location.origin).toString()
  }

  async function copyToClipboard(text: string) {
    const copied = await copyText(text)
    toasts[copied ? 'success' : 'error'](
      t(copied ? 'exchangeDetail.linkCopied' : 'exchangeDetail.copyFailed'),
    )
  }

  function openAccessLinkModal(link: string) {
    latestAccessLink.value = resolveParticipantAccessLink(link)
    showAccessLinkModal.value = true
  }

  async function fetchExchangeData(signal?: AbortSignal) {
    const id = String(route.params.id)
    const token = adminAuthStore.getSessionToken(id)
    const init = { signal, headers: token ? { Authorization: `Bearer ${token}` } : undefined }
    const current = () =>
      !signal?.aborted && id === route.params.id && token === adminAuthStore.getSessionToken(id)
    try {
      const [exchangeResponse, exclusionsResponse] = await Promise.all([
        api.get<ExchangeDto>(`/api/exchanges/${id}`, init),
        api.get<ExclusionRule[]>(`/api/exchanges/${id}/exclusions`, init),
      ])
      if (!current()) throw new HttpError('Superseded read.', 0, null, 'REQUEST_ABORTED')
      return {
        exchangeResponse,
        participantsResponse: exchangeResponse.participants ?? [],
        exclusionsResponse,
      }
    } catch (cause) {
      if (!current()) throw new HttpError('Superseded read.', 0, null, 'REQUEST_ABORTED')
      throw cause
    }
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
    showAccessLinkModal.value = false
    latestAccessLink.value = ''
    error.value = t('exchangeDetail.adminAuth.required')
  }

  function acceptData(data: Awaited<ReturnType<typeof fetchExchangeData>>) {
    requiresAdminAuth.value = false
    exchange.value = data.exchangeResponse
    participants.value = data.participantsResponse
    exclusionRules.value = data.exclusionsResponse
  }
  let loadGeneration = 0
  let initialController: AbortController | undefined
  async function fetchExchange() {
    const generation = ++loadGeneration
    initialController?.abort()
    initialController = new AbortController()
    isLoading.value = true
    error.value = null
    try {
      acceptData(await fetchExchangeData(initialController.signal))
      if (showEditExchangeModal.value) editExchangeCurrent.value = clone(exchange.value!)
      if (showEditParticipantModal.value)
        editParticipantCurrent.value = clone(
          participants.value.find((p) => p.id === editingParticipant.value?.id) ??
            editingParticipant.value!,
        )
    } catch (cause) {
      if (isRequestAborted(cause)) return
      if (isAdminAuthError(cause)) {
        setAdminAuthRequired()
        return
      }
      error.value = getApiErrorMessage(cause)
    } finally {
      if (generation === loadGeneration) isLoading.value = false
    }
  }
  const refreshEnabled = computed(
    () =>
      !requiresAdminAuth.value &&
      !isLoading.value &&
      !mutationBusy.value &&
      !showEditExchangeModal.value &&
      !showEditParticipantModal.value &&
      !showAccessLinkModal.value &&
      !inlineDirty.value,
  )
  const refreshState = useRefresh(
    async (signal) => {
      try {
        acceptData(await fetchExchangeData(signal))
        error.value = null
      } catch (cause) {
        if (isAdminAuthError(cause)) setAdminAuthRequired()
        throw cause
      }
    },
    refreshEnabled,
    5000,
  )
  const refreshPaused = refreshState.paused
  async function manualRefresh() {
    try {
      await refreshState.refresh()
    } catch (cause) {
      error.value = getApiErrorMessage(cause)
    }
  }
  function preventPendingNavigation() {
    if (!mutationBusy.value) return true
    toasts.info(t('p2.waitForAction'))
    return false
  }
  onBeforeRouteLeave(preventPendingNavigation)
  onBeforeRouteUpdate(preventPendingNavigation)
  watch(
    () => route.params.id,
    () => {
      refreshState.cancel(true)
      exchange.value = null
      participants.value = []
      exclusionRules.value = []
      showEditExchangeModal.value = false
      showEditParticipantModal.value = false
      showAccessLinkModal.value = false
      editingParticipant.value = null
      latestAccessLink.value = ''
      editExchangeCurrent.value = null
      editParticipantCurrent.value = null
      requiresAdminAuth.value = false
      actionError.value = null
      newParticipantName.value = ''
      newParticipantEmail.value = ''
      currentAdminPassword.value = ''
      newAdminPassword.value = ''
      confirmAdminPassword.value = ''
      addForm.clear()
      passwordForm.clear()
      void fetchExchange()
    },
  )

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

  async function perform_addParticipantExclusion(giverParticipantId: string) {
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

  async function perform_removeParticipantExclusion(ruleId: string) {
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
      toasts.error(
        getApiErrorMessage(err, { fallbackKey: 'exchangeDetail.exceptions.removeFailed' }),
      )
    }
  }

  async function perform_authenticateAdmin() {
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
    } finally {
      isAuthenticatingAdmin.value = false
    }
  }

  async function perform_changeAdminPassword() {
    if (!exchange.value || isChangingAdminPassword.value) return
    if (!currentAdminPassword.value || !newAdminPassword.value) return

    passwordForm.clear()
    if (newAdminPassword.value !== confirmAdminPassword.value) {
      passwordError.value = t('exchangeDetail.adminAuth.passwordMismatch')
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

      const replacement = await api.put<{ adminSessionToken: string }>(
        `/api/exchanges/${exchangeId}/admin/password`,
        {
          currentPassword: currentAdminPassword.value,
          newPassword: newAdminPassword.value,
        },
        init,
      )

      adminAuthStore.setSession(exchangeId, replacement.adminSessionToken)
      currentAdminPassword.value = ''
      newAdminPassword.value = ''
      confirmAdminPassword.value = ''
      toasts.success(t('exchangeDetail.adminAuth.passwordUpdated'))
    } catch (err) {
      if (isAdminAuthError(err)) {
        setAdminAuthRequired()
        return
      }

      passwordForm.capture(err)
    } finally {
      isChangingAdminPassword.value = false
    }
  }

  async function perform_logoutAdmin() {
    if ((exchangeDirty.value || participantDirty.value || inlineDirty.value) && !confirmDiscard())
      return
    newParticipantName.value = ''
    newParticipantEmail.value = ''
    currentAdminPassword.value = ''
    newAdminPassword.value = ''
    confirmAdminPassword.value = ''
    showEditExchangeModal.value = false
    showEditParticipantModal.value = false
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
      toasts.success(t('exchangeDetail.adminAuth.loggedOut'))
    } catch {
      toasts.warning(t('p2.logoutUnconfirmed'), 0)
    } finally {
      const exchangeId = route.params.id as string
      adminAuthStore.clearSession(exchangeId)
      requiresAdminAuth.value = true
      error.value = t('exchangeDetail.adminAuth.required')
      isLoggingOutAdmin.value = false
    }
  }

  onMounted(() => {
    // S'assurer que les modales ne sont jamais ouvertes au chargement
    showEditParticipantModal.value = false
    editingParticipant.value = null
    fetchExchange()
    void loadConfig()
  })

  onUnmounted(() => {
    refreshState.cancel()
    initialController?.abort()
  })

  function startEdit() {
    if (!exchange.value || exchange.value.isArchived) return
    exchangeForm.clear()
    editExchangeCurrent.value = null
    showEditExchangeModal.value = true
  }

  async function perform_saveEdit(payload: UpdateExchangeInputDto) {
    if (!exchange.value || isSavingExchange.value) return
    isSavingExchange.value = true
    exchangeForm.clear()
    try {
      await exchangesStore.updateExchange(exchange.value.id, payload)
      showEditExchangeModal.value = false
      await fetchExchange()
    } catch (err) {
      if (isAdminAuthError(err)) {
        setAdminAuthRequired()
        return
      }

      exchangeForm.capture(err)
      if (
        err instanceof HttpError &&
        (err.status === 409 ||
          ['EXCHANGE_DRAW_SETTINGS_LOCKED', 'EXCHANGE_ARCHIVED_CANNOT_MODIFY'].includes(
            err.code ?? '',
          ))
      ) {
        try {
          const data = await fetchExchangeData()
          acceptData(data)
          editExchangeCurrent.value = clone(data.exchangeResponse)
        } catch {
          /* Preserve the draft and original error. */
        }
      }
    } finally {
      isSavingExchange.value = false
    }
  }

  async function perform_handleDelete() {
    if (!exchange.value) return
    if (!confirm(t('exchangeDetail.confirmDeleteExchange'))) return
    try {
      await exchangesStore.deleteExchange(exchange.value.id)
      await router.push({ name: 'home' })
    } catch (err) {
      if (isAdminAuthError(err)) {
        setAdminAuthRequired()
        return
      }

      actionError.value = getApiErrorMessage(err)
    }
  }

  // Fonctions pour les participants
  function handleParticipantUploadError(cause: unknown) {
    participantForm.capture(cause)
    if (isAdminAuthError(cause)) setAdminAuthRequired()
  }
  function openEditParticipantModal(participant: ParticipantDto) {
    if (isParticipantSuggestionsLocked.value) return
    participantForm.clear()
    editParticipantCurrent.value = null
    editingParticipant.value = clone(participant)
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

  async function handleAddNewParticipant(e?: Event) {
    if (e) {
      e.preventDefault()
    }
    if (!newParticipantName.value.trim()) return
    await addParticipant({
      name: newParticipantName.value,
      email: newParticipantEmail.value,
    })
    await nextTick()
    newParticipantNameInput.value?.focus()
  }

  async function perform_addParticipant(payload: { name: string; email: string }) {
    if (!exchange.value || isParticipantCreationLocked.value) return
    isAddingParticipant.value = true
    addForm.clear()
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

      const result = await api.post<{ participant: ParticipantDto; accessLink: string }>(
        `/api/exchanges/${exchange.value.id}/participants`,
        {
          name: payload.name,

          email: payload.email,
        },
        init,
      )

      if (result?.participant) {
        participants.value = [...participants.value, result.participant]
      }

      if (result.accessLink) openAccessLinkModal(result.accessLink)
      newParticipantName.value = ''
      newParticipantEmail.value = ''
    } catch (err) {
      if (isAdminAuthError(err)) {
        setAdminAuthRequired()
        return
      }

      addForm.capture(err)
    } finally {
      isAddingParticipant.value = false
    }
  }

  async function perform_updateParticipant(payload: UpdateParticipantInputDto) {
    if (!editingParticipant.value || !exchange.value) return
    const participantId = editingParticipant.value.id
    participantForm.clear()
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
        payload,
        init,
      )
      setEditParticipantModalVisibility(false)
      await fetchExchange()
    } catch (err) {
      if (isAdminAuthError(err)) {
        setAdminAuthRequired()
        return
      }

      participantForm.capture(err)
      if (
        err instanceof HttpError &&
        (err.status === 409 ||
          [
            'PARTICIPANT_IDENTITY_LOCKED',
            'PARTICIPANT_SUGGESTIONS_LOCKED',
            'EXCHANGE_ARCHIVED_CANNOT_MODIFY',
          ].includes(err.code ?? ''))
      ) {
        try {
          const data = await fetchExchangeData()
          acceptData(data)
          editParticipantCurrent.value = clone(
            data.participantsResponse.find((p) => p.id === participantId) ??
              editingParticipant.value!,
          )
        } catch {
          /* Preserve the draft. */
        }
      }
    }
  }

  async function perform_deleteParticipant(participantId: string) {
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

      actionError.value = getApiErrorMessage(err)
    }
  }

  async function perform_regenerateParticipantLink(participantId: string) {
    if (!confirm(t('p2.confirmReplaceLink'))) return
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

      actionError.value = getApiErrorMessage(err)
    }
  }

  async function perform_triggerDraw() {
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

  async function perform_cancelDraw() {
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

  const addParticipantExclusion = async (
    ...args: Parameters<typeof perform_addParticipantExclusion>
  ) => {
    if (mutationBusy.value) return
    mutationBusy.value = true
    actionError.value = null
    refreshState.cancel()
    try {
      return await perform_addParticipantExclusion(...args)
    } finally {
      mutationBusy.value = false
    }
  }
  const removeParticipantExclusion = async (
    ...args: Parameters<typeof perform_removeParticipantExclusion>
  ) => {
    if (mutationBusy.value) return
    mutationBusy.value = true
    actionError.value = null
    refreshState.cancel()
    try {
      return await perform_removeParticipantExclusion(...args)
    } finally {
      mutationBusy.value = false
    }
  }
  const authenticateAdmin = async (...args: Parameters<typeof perform_authenticateAdmin>) => {
    if (mutationBusy.value) return
    mutationBusy.value = true
    actionError.value = null
    refreshState.cancel()
    try {
      return await perform_authenticateAdmin(...args)
    } finally {
      mutationBusy.value = false
    }
  }
  const changeAdminPassword = async (...args: Parameters<typeof perform_changeAdminPassword>) => {
    if (mutationBusy.value) return
    mutationBusy.value = true
    actionError.value = null
    refreshState.cancel()
    try {
      return await perform_changeAdminPassword(...args)
    } finally {
      mutationBusy.value = false
    }
  }
  const logoutAdmin = async (...args: Parameters<typeof perform_logoutAdmin>) => {
    if (mutationBusy.value) return
    mutationBusy.value = true
    actionError.value = null
    refreshState.cancel()
    try {
      return await perform_logoutAdmin(...args)
    } finally {
      mutationBusy.value = false
    }
  }
  const saveEdit = async (...args: Parameters<typeof perform_saveEdit>) => {
    if (mutationBusy.value) return
    mutationBusy.value = true
    actionError.value = null
    refreshState.cancel()
    try {
      return await perform_saveEdit(...args)
    } finally {
      mutationBusy.value = false
    }
  }
  const handleDelete = async (...args: Parameters<typeof perform_handleDelete>) => {
    if (mutationBusy.value) return
    mutationBusy.value = true
    actionError.value = null
    refreshState.cancel()
    try {
      return await perform_handleDelete(...args)
    } finally {
      mutationBusy.value = false
    }
  }
  const addParticipant = async (...args: Parameters<typeof perform_addParticipant>) => {
    if (mutationBusy.value) return
    mutationBusy.value = true
    actionError.value = null
    refreshState.cancel()
    try {
      return await perform_addParticipant(...args)
    } finally {
      mutationBusy.value = false
    }
  }
  const updateParticipant = async (...args: Parameters<typeof perform_updateParticipant>) => {
    if (mutationBusy.value) return
    mutationBusy.value = true
    actionError.value = null
    refreshState.cancel()
    try {
      return await perform_updateParticipant(...args)
    } finally {
      mutationBusy.value = false
    }
  }
  const deleteParticipant = async (...args: Parameters<typeof perform_deleteParticipant>) => {
    if (mutationBusy.value) return
    mutationBusy.value = true
    actionError.value = null
    refreshState.cancel()
    try {
      return await perform_deleteParticipant(...args)
    } finally {
      mutationBusy.value = false
    }
  }
  const regenerateParticipantLink = async (
    ...args: Parameters<typeof perform_regenerateParticipantLink>
  ) => {
    if (mutationBusy.value) return
    mutationBusy.value = true
    actionError.value = null
    refreshState.cancel()
    try {
      return await perform_regenerateParticipantLink(...args)
    } finally {
      mutationBusy.value = false
    }
  }
  const triggerDraw = async (...args: Parameters<typeof perform_triggerDraw>) => {
    if (mutationBusy.value) return
    mutationBusy.value = true
    actionError.value = null
    refreshState.cancel()
    try {
      return await perform_triggerDraw(...args)
    } finally {
      mutationBusy.value = false
    }
  }
  const cancelDraw = async (...args: Parameters<typeof perform_cancelDraw>) => {
    if (mutationBusy.value) return
    mutationBusy.value = true
    actionError.value = null
    refreshState.cancel()
    try {
      return await perform_cancelDraw(...args)
    } finally {
      mutationBusy.value = false
    }
  }

  return {
    api,
    toasts,
    adminAuthStore,
    route,
    router,
    exchangesStore,
    exchange,
    participants,
    exclusionRules,
    selectedExceptionReceiverByParticipant,
    isLoading,
    error,
    requiresAdminAuth,
    adminPassword,
    isAuthenticatingAdmin,
    showEditExchangeModal,
    maxActiveParticipants,
    configError,
    configLoading,
    mutationBusy,
    actionError,
    addParticipantError,
    addParticipantFieldErrors,
    passwordError,
    passwordFieldErrors,
    exchangeForm,
    editExchangeError,
    editParticipantError,
    editExchangeCurrent,
    editParticipantCurrent,
    exchangeDirty,
    isSavingExchange,
    isDrawActionLoading,
    isLoggingOutAdmin,
    isChangingAdminPassword,
    currentAdminPassword,
    newAdminPassword,
    confirmAdminPassword,
    showEditParticipantModal,
    showAccessLinkModal,
    editingParticipant,
    latestAccessLink,
    newParticipantName,
    newParticipantEmail,
    newParticipantNameInput,
    isAddingParticipant,
    isExclusionEditingLocked,
    activeParticipants,
    participantNameById,
    detailMode,
    isSummaryMode,
    isDetailMode,
    canTriggerDraw,
    canCancelDraw,
    isParticipantCreationLocked,
    isParticipantIdentityLocked,
    isParticipantSuggestionsLocked,
    participantCountLabel,
    publicExchangeLink,
    statusBadgeClass,
    statusLabel,
    refreshEnabled,
    refreshState,
    refreshPaused,
    addParticipantExclusion,
    removeParticipantExclusion,
    authenticateAdmin,
    changeAdminPassword,
    logoutAdmin,
    saveEdit,
    handleDelete,
    addParticipant,
    updateParticipant,
    deleteParticipant,
    regenerateParticipantLink,
    triggerDraw,
    cancelDraw,
    loadConfig,
    resolveParticipantAccessLink,
    copyToClipboard,
    openAccessLinkModal,
    fetchExchangeData,
    isAdminAuthError,
    setAdminAuthRequired,
    acceptData,
    fetchExchange,
    manualRefresh,
    preventPendingNavigation,
    getParticipantExclusions,
    getReceiverCandidates,
    startEdit,
    openEditParticipantModal,
    handleParticipantUploadError,
    setEditParticipantModalVisibility,
    setAccessLinkModalVisibility,
    handleAddNewParticipant,
    editExchangeFieldErrors,
    editParticipantFieldErrors,
    participantDirty,
  }
}
