import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export const useAppStore = defineStore('app', () => {
  const appName = ref('Kado')
  const isLoading = ref(false)

  const pageTitle = computed(() => appName.value)

  function setLoading(value: boolean) {
    isLoading.value = value
  }

  return {
    appName,
    isLoading,
    pageTitle,
    setLoading,
  }
})
