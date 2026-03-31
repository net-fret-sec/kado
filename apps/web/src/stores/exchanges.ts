import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { ExchangeDto } from '@kado/shared'

export const useExchangesStore = defineStore('exchanges', () => {
  const exchanges = ref<ExchangeDto[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const fieldErrors = ref<Record<string, string[]> | null>(null)
  const formErrors = ref<string[] | null>(null)

  async function fetchExchanges() {
    isLoading.value = true
    error.value = null
    try {
      const response = await fetch('http://localhost:3000/api/exchanges')
      if (!response.ok) {
        throw new Error('Failed to fetch exchanges')
      }
      exchanges.value = await response.json()
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
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
        const response = await fetch('http://localhost:3000/api/exchanges', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newExchange),
        });
        const data = await response.json();
        if (!response.ok) {
          if (data?.error?.details) {
            fieldErrors.value = data.error.details.fieldErrors || null;
            formErrors.value = data.error.details.formErrors || null;
            error.value = data.error.message || 'Erreur lors de la création';
          } else {
            error.value = data?.error?.message || 'Erreur lors de la création';
          }
          throw new Error(error.value || 'Erreur lors de la création');
        }
        exchanges.value.push(data.exchange);
        return data.exchange;
      } catch (err) {
        if (!error.value) {
          error.value = err instanceof Error ? err.message : 'Erreur inconnue';
        }
        throw err;
      } finally {
        isLoading.value = false;
      }
    },

    async updateExchange(id: string, updatedFields: Partial<ExchangeDto>) {
      isLoading.value = true;
      error.value = null;
      try {
        const response = await fetch(`http://localhost:3000/api/exchanges/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedFields),
        });
        if (!response.ok) throw new Error('Erreur lors de la modification');
        const updated = await response.json();
        const idx = exchanges.value.findIndex(e => e.id === id);
        if (idx !== -1) exchanges.value[idx] = updated;
        return updated;
      } catch (err) {
        error.value = err instanceof Error ? err.message : 'Erreur inconnue';
        throw err;
      } finally {
        isLoading.value = false;
      }
    },

    async deleteExchange(id: string) {
      isLoading.value = true;
      error.value = null;
      try {
        const response = await fetch(`http://localhost:3000/api/exchanges/${id}`, {
          method: 'DELETE',
        });
        if (!response.ok) throw new Error('Erreur lors de la suppression');
        exchanges.value = exchanges.value.filter(e => e.id !== id);
      } catch (err) {
        error.value = err instanceof Error ? err.message : 'Erreur inconnue';
        throw err;
      } finally {
        isLoading.value = false;
      }
    },
  }
})
