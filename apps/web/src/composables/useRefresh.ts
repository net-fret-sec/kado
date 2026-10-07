import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import { HttpError, isRequestAborted } from './useApi'

export function useRefresh(
  load: (signal: AbortSignal) => Promise<void>,
  enabled: Readonly<Ref<boolean>>,
  interval?: number,
) {
  const busy = ref(false)
  const paused = ref(false)
  const waitUntil = ref(0)
  const failures = ref(0)
  const remaining = computed(() => Math.max(0, waitUntil.value - Date.now()))
  let controller: AbortController | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  let generation = 0
  function schedule() {
    if (timer) clearTimeout(timer)
    if (!interval || disposed) return
    timer = setTimeout(
      () => {
        void refresh(false)
      },
      Math.max(interval, waitUntil.value - Date.now()),
    )
  }
  async function refresh(force = true) {
    if (
      disposed ||
      busy.value ||
      document.hidden ||
      !enabled.value ||
      Date.now() < waitUntil.value
    ) {
      schedule()
      return
    }
    busy.value = true
    const currentGeneration = ++generation
    controller = new AbortController()
    try {
      await load(controller.signal)
      if (currentGeneration !== generation) return
      failures.value = 0
      paused.value = false
      waitUntil.value = 0
    } catch (error) {
      if (currentGeneration !== generation) return
      if (!isRequestAborted(error)) {
        paused.value = true
        failures.value += 1
        const backoff = Math.min(60_000, 5000 * 2 ** Math.min(failures.value, 4))
        waitUntil.value =
          Date.now() + Math.max(backoff, error instanceof HttpError ? (error.retryAfterMs ?? 0) : 0)
        if (force) throw error
      }
    } finally {
      if (currentGeneration === generation) {
        busy.value = false
        schedule()
      }
    }
  }
  function cancel(reset = false) {
    controller?.abort()
    generation += 1
    busy.value = false
    if (reset) {
      waitUntil.value = 0
      failures.value = 0
      paused.value = false
    }
  }
  function visibility() {
    if (document.hidden) cancel()
    else void refresh(false)
  }
  onMounted(() => {
    document.addEventListener('visibilitychange', visibility)
    schedule()
  })
  onBeforeUnmount(() => {
    disposed = true
    cancel()
    if (timer) clearTimeout(timer)
    document.removeEventListener('visibilitychange', visibility)
  })
  return { refresh, cancel, busy, paused, remaining, waitUntil }
}
