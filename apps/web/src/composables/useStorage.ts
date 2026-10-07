import { ref } from 'vue'
export const storageUnavailable = ref(false)
export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    storageUnavailable.value = true
    return null
  }
}
export function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    storageUnavailable.value = true
  }
}
