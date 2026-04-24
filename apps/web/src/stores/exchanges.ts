import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { ExchangeDto } from '@kado/shared'
import { useApi } from '@/composables/useApi'
import { useToastsStore } from '@/stores/toasts'
import { getApiErrorMessage } from '@/composables/useApiErrorMessage'
import { useAdminAuthStore } from '@/stores/useAdminAuthStore'

type ValidationErrorDetails = {
  fieldErrors?: Record<string, string[]>
  formErrors?: string[]
}

function extractValidationErrorDetails(error: unknown): ValidationErrorDetails | null {
  if (!error || typeof error !== 'object') return null

  const payload = (error as { data?: unknown }).data
  if (!payload || typeof payload !== 'object') return null

  const details = (payload as { error?: { details?: unknown } }).error?.details
  if (!details || typeof details !== 'object') return null

  const fieldErrorsRaw = (details as { fieldErrors?: unknown }).fieldErrors
  const formErrorsRaw = (details as { formErrors?: unknown }).formErrors

  const fieldErrors: Record<string, string[]> = {}

  if (fieldErrorsRaw && typeof fieldErrorsRaw === 'object') {
    for (const [key, value] of Object.entries(fieldErrorsRaw)) {
      if (Array.isArray(value)) {
        const messages = value.filter((entry): entry is string => typeof entry === 'string')
        if (messages.length > 0) {
          fieldErrors[key] = messages
        }
      }
    }
  }

  const formErrors = Array.isArray(formErrorsRaw)
    ? formErrorsRaw.filter((entry): entry is string => typeof entry === 'string')
    : []

  if (Object.keys(fieldErrors).length === 0 && formErrors.length === 0) {
    return null
  }

  return {
    fieldErrors,
    formErrors,
  }
}

export const useExchangesStore = defineStore('exchanges', () => {
  const exchanges = ref<ExchangeDto[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const fieldErrors = ref<Record<string, string[]> | null>(null)
  const formErrors = ref<string[] | null>(null)
  const api = useApi()
  const toasts = useToastsStore()
  const adminAuthStore = useAdminAuthStore()

  function getAdminRequestInit(exchangeId: string): RequestInit | undefined {
    const token = adminAuthStore.getSessionToken(exchangeId)
    if (!token) return undefined

    return {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  }

  async function fetchExchanges() {
    isLoading.value = true
    error.value = null
    try {
      exchanges.value = await api.get<ExchangeDto[]>('/api/exchanges')
    } catch (err) {
      error.value = getApiErrorMessage(err)
      toasts.error(error.value)
    } finally {
      isLoading.value = false
    }
  }

  return {
    exchanges,
    isLoading,
    error,
    fieldErrors,
    formErrors,
    fetchExchanges,
    async createExchange(newExchange: {
      name: string
      description?: string
      organizerName: string
      organizerParticipates?: boolean
      noMutualAssignments?: boolean
      adminPassword: string
      eventDate?: string
      budget?: number
      minWishlistSuggestions?: number
      lockSuggestionsAfterDraw?: boolean
    }) {
      isLoading.value = true
      error.value = null
      fieldErrors.value = null
      formErrors.value = null
      try {
        const data = await api.post<
          { exchange: ExchangeDto; adminSessionToken?: string },
          typeof newExchange
        >('/api/exchanges', newExchange)

        if (data.adminSessionToken) {
          adminAuthStore.setSession(data.exchange.id, data.adminSessionToken)
        }

        exchanges.value.push(data.exchange)
        return data.exchange
      } catch (err) {
        const validationDetails = extractValidationErrorDetails(err)
        if (validationDetails) {
          fieldErrors.value = validationDetails.fieldErrors ?? null
          formErrors.value = validationDetails.formErrors ?? null
        }
        if (!error.value) {
          error.value = getApiErrorMessage(err)
        }
        toasts.error(error.value)
        throw err
      } finally {
        isLoading.value = false
      }
    },

    async updateExchange(
      id: string,
      updatedFields: Partial<ExchangeDto> & { expectedUpdatedAt?: string },
    ) {
      isLoading.value = true
      error.value = null
      try {
        const updated = await api.put<
          ExchangeDto,
          Partial<ExchangeDto> & { expectedUpdatedAt?: string }
        >(`/api/exchanges/${id}`, updatedFields, getAdminRequestInit(id))
        const idx = exchanges.value.findIndex((e) => e.id === id)
        if (idx !== -1) exchanges.value[idx] = updated
        return updated
      } catch (err) {
        error.value = getApiErrorMessage(err)
        toasts.error(error.value)
        throw err
      } finally {
        isLoading.value = false
      }
    },

    async deleteExchange(id: string) {
      isLoading.value = true
      error.value = null
      try {
        await api.delete(`/api/exchanges/${id}`, getAdminRequestInit(id))
        exchanges.value = exchanges.value.filter((e) => e.id !== id)
      } catch (err) {
        error.value = getApiErrorMessage(err)
        toasts.error(error.value)
        throw err
      } finally {
        isLoading.value = false
      }
    },
  }
})
