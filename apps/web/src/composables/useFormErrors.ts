import { computed, ref, shallowRef } from 'vue'
import { getApiErrorMessage } from './useApiErrorMessage'
import { i18n } from '@/i18n'
export function useFormErrors() {
  // Retain the failure, not a translation frozen at the time of the request.
  const failure = shallowRef<{ cause: unknown } | { messageKey: string } | null>(null)
  const error = computed(() => {
    const current = failure.value
    if (!current) return null
    return 'messageKey' in current
      ? i18n.global.t(current.messageKey)
      : getApiErrorMessage(current.cause)
  })
  const fieldErrors = ref<Record<string, string[]>>({})
  function clear() {
    failure.value = null
    fieldErrors.value = {}
  }
  function setMessage(messageKey: string) {
    failure.value = { messageKey }
    fieldErrors.value = {}
  }
  function capture(cause: unknown) {
    failure.value = { cause }
    const details = (
      cause as { data?: { error?: { details?: { fieldErrors?: Record<string, string[]> } } } }
    )?.data?.error?.details
    fieldErrors.value = details?.fieldErrors ?? {}
  }
  return { error, fieldErrors, clear, capture, setMessage }
}
