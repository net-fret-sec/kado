import { onBeforeUnmount, onMounted, type Ref } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { i18n } from '@/i18n'

export function confirmDiscard() {
  return window.confirm(i18n.global.t('p2.discardDraft'))
}
export function useDraftGuard(dirty: Readonly<Ref<boolean>>) {
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (dirty.value) {
      event.preventDefault()
      event.returnValue = ''
    }
  }
  const allow = () => !dirty.value || confirmDiscard()
  onBeforeRouteLeave(allow)
  // Updating an anchor/query on the same page keeps the form and its draft.
  onBeforeRouteUpdate((to, from) => to.path === from.path || allow())
  onMounted(() => window.addEventListener('beforeunload', beforeUnload))
  onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
  return allow
}
