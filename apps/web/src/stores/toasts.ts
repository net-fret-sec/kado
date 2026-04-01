import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ToastVariant = 'success' | 'info' | 'warning' | 'danger'

export interface ToastItem {
  id: number
  message: string
  variant: ToastVariant
  timeout: number
}

let nextId = 1

export const useToastsStore = defineStore('toasts', () => {
  const items = ref<ToastItem[]>([])

  function remove(id: number) {
    items.value = items.value.filter(t => t.id !== id)
  }

  function add(message: string, variant: ToastVariant = 'danger', timeout = 5000) {
    const id = nextId++
    const toast: ToastItem = { id, message, variant, timeout }
    items.value.push(toast)
    if (timeout > 0) setTimeout(() => remove(id), timeout)
    return id
  }

  function error(message: string, timeout = 6000) {
    return add(message, 'danger', timeout)
  }

  function success(message: string, timeout = 3000) {
    return add(message, 'success', timeout)
  }

  function info(message: string, timeout = 3000) {
    return add(message, 'info', timeout)
  }

  function warning(message: string, timeout = 4000) {
    return add(message, 'warning', timeout)
  }

  return { items, add, remove, error, success, info, warning }
})
