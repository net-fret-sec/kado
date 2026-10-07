import { ref, onScopeDispose } from 'vue'
import { readStorage, writeStorage } from '@/composables/useStorage'
import { defineStore } from 'pinia'

const STORAGE_KEY = 'kado.adminSessions'

type AdminSessions = Record<string, string>

function loadSessionsFromStorage(): AdminSessions {
  if (typeof window === 'undefined') return {}

  const raw = readStorage(STORAGE_KEY)
  if (!raw) return {}

  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}

    const entries = Object.entries(parsed as Record<string, unknown>).filter(
      ([exchangeId, token]) =>
        typeof exchangeId === 'string' &&
        exchangeId.length > 0 &&
        typeof token === 'string' &&
        token.length > 0,
    )

    return entries.reduce<AdminSessions>((acc, [exchangeId, token]) => {
      acc[exchangeId] = token as string
      return acc
    }, {})
  } catch {
    return {}
  }
}

function saveSessionsToStorage(sessions: AdminSessions) {
  if (typeof window === 'undefined') return
  writeStorage(STORAGE_KEY, JSON.stringify(sessions))
}

export const useAdminAuthStore = defineStore('admin-auth', () => {
  const sessions = ref<AdminSessions>(loadSessionsFromStorage())
  const synchronize = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) sessions.value = loadSessionsFromStorage()
  }
  window.addEventListener('storage', synchronize)
  onScopeDispose(() => window.removeEventListener('storage', synchronize))

  function getSessionToken(exchangeId: string): string | null {
    return sessions.value[exchangeId] ?? null
  }

  function setSession(exchangeId: string, token: string) {
    sessions.value = {
      ...sessions.value,
      [exchangeId]: token,
    }
    saveSessionsToStorage(sessions.value)
  }

  function clearSession(exchangeId: string) {
    if (!(exchangeId in sessions.value)) return

    const { [exchangeId]: _discarded, ...rest } = sessions.value
    sessions.value = rest
    saveSessionsToStorage(sessions.value)
  }

  return {
    sessions,
    getSessionToken,
    setSession,
    clearSession,
  }
})
