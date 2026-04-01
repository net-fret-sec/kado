import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { ExchangeDto } from '@kado/shared'
import { useApi } from '@/composables/useApi'
import { useToastsStore } from '@/stores/toasts'

export const useExchangesStore = defineStore('exchanges', () => {
  const exchanges = ref<ExchangeDto[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const fieldErrors = ref<Record<string, string[]> | null>(null)
  const formErrors = ref<string[] | null>(null)
  const api = useApi()
  const toasts = useToastsStore()

  async function fetchExchanges() {
    isLoading.value = true
    error.value = null
    try {
      exchanges.value = await api.get<ExchangeDto[]>('/api/exchanges')
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
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
      name: string;
      description?: string;
      organizerName: string;
      organizerParticipates?: boolean;
      adminPassword: string;
      eventDate?: string;
      budget?: number;
      budgetCurrency?: string;
    }) {
      isLoading.value = true;
      error.value = null;
      fieldErrors.value = null;
      formErrors.value = null;
      try {
        const data = await api.post<{ exchange: ExchangeDto }, typeof newExchange>('/api/exchanges', newExchange)
        exchanges.value.push(data.exchange)
        return data.exchange
      } catch (err) {
        if (!error.value) {
          error.value = err instanceof Error ? err.message : 'Erreur inconnue';
        }
        toasts.error(error.value)
        throw err;
      } finally {
        isLoading.value = false;
      }
    },

    async updateExchange(id: string, updatedFields: Partial<ExchangeDto>) {
      isLoading.value = true;
      error.value = null;
      try {
        const updated = await api.put<ExchangeDto, Partial<ExchangeDto>>(`/api/exchanges/${id}`, updatedFields)
        const idx = exchanges.value.findIndex(e => e.id === id);
        if (idx !== -1) exchanges.value[idx] = updated;
        return updated;
      } catch (err) {
        error.value = err instanceof Error ? err.message : 'Erreur inconnue';
        toasts.error(error.value)
        throw err;
      } finally {
        isLoading.value = false;
      }
    },

    async deleteExchange(id: string) {
      isLoading.value = true;
      error.value = null;
      try {
        await api.delete(`/api/exchanges/${id}`)
        exchanges.value = exchanges.value.filter(e => e.id !== id);
      } catch (err) {
        error.value = err instanceof Error ? err.message : 'Erreur inconnue';
        toasts.error(error.value)
        throw err;
      } finally {
        isLoading.value = false;
      }
    },
  }
})
