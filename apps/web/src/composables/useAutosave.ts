import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue'

// Commit only after an explicit editing boundary. Never retry a failed write blindly.
export function useAutosave(options: {
  dirty: Readonly<Ref<boolean>>
  valid: Readonly<Ref<boolean>>
  blocked: Readonly<Ref<boolean>>
  active: Readonly<Ref<boolean>>
  save: () => Promise<boolean>
}) {
  const saving = ref(false)
  const failed = ref(false)
  const saved = ref(false)
  const queued = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  let generation = 0
  function cancel() {
    if (timer) clearTimeout(timer)
    timer = undefined
    queued.value = false
  }
  function reset() {
    cancel()
    generation++
    failed.value = false
    saved.value = false
  }
  async function saveNow(): Promise<boolean> {
    cancel()
    if (!options.dirty.value) return true
    if (saving.value || options.blocked.value || !options.active.value || !options.valid.value)
      return false
    const current = generation
    saving.value = true
    failed.value = false
    try {
      const ok = await options.save()
      if (current === generation) {
        failed.value = !ok
        saved.value = ok
      }
      return ok
    } finally {
      saving.value = false
    }
  }
  async function flush() {
    if (!queued.value || saving.value || options.blocked.value) return
    await saveNow()
  }
  function request() {
    if (!options.active.value) return
    cancel()
    queued.value = true
    timer = setTimeout(() => {
      timer = undefined
      void flush()
    }, 350)
  }
  watch(options.blocked, (blocked) => {
    if (!blocked && queued.value && !timer) void flush()
  })
  watch(options.active, (active) => {
    if (!active) reset()
  })
  watch(options.dirty, (dirty) => {
    if (!dirty) {
      cancel()
      failed.value = false
    }
  })
  onBeforeUnmount(reset)
  const status = computed(() =>
    saving.value
      ? 'saving'
      : failed.value && options.dirty.value
        ? 'failed'
        : options.dirty.value
          ? 'pending'
          : saved.value
            ? 'saved'
            : 'help',
  )
  return { request, saveNow, cancel, reset, status, saving }
}
