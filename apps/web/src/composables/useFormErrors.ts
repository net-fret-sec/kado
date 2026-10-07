import { ref } from 'vue'
import { getApiErrorMessage } from './useApiErrorMessage'
export function useFormErrors() {
  const error = ref<string | null>(null)
  const fieldErrors = ref<Record<string, string[]>>({})
  function clear() {
    error.value = null
    fieldErrors.value = {}
  }
  function capture(cause: unknown) {
    error.value = getApiErrorMessage(cause)
    const details = (
      cause as { data?: { error?: { details?: { fieldErrors?: Record<string, string[]> } } } }
    )?.data?.error?.details
    fieldErrors.value = details?.fieldErrors ?? {}
  }
  return { error, fieldErrors, clear, capture }
}
