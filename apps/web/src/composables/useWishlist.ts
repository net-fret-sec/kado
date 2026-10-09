import { ref, provide, inject, watch, onBeforeUnmount, type InjectionKey } from 'vue'
import { giftSuggestionSchema, type GiftSuggestionDto } from '@kado/shared'
import { useApi } from './useApi'
export type SuggestionDraft = GiftSuggestionDto & { pendingImage?: string }
export type EditableSuggestion = SuggestionDraft & { _clientId: string }
interface Files {
  get: (key: string) => File | undefined
  select: (file: File) => string
}
const filesKey: InjectionKey<Files> = Symbol('suggestion-files')
export function useSuggestionFiles() {
  return inject(filesKey, {
    get: () => undefined,
    select: () => {
      throw new Error('No draft context')
    },
  })
}
export function serializeWishlist(items: GiftSuggestionDto[]): GiftSuggestionDto[] {
  return items.map(({ title, imageId, linkUrl }) => ({ title, imageId, linkUrl }))
}
export function draftWishlist(items: SuggestionDraft[]) {
  return items.map(({ title, imageId, linkUrl, pendingImage }) => ({
    title,
    imageId,
    linkUrl,
    pendingImage,
  }))
}
export function isValidSuggestion(item: GiftSuggestionDto) {
  const { _clientId: _id, pendingImage: _pending, ...value } = item as EditableSuggestion
  return giftSuggestionSchema.safeParse(value).success
}
export function useWishlist() {
  const wishlist = ref<EditableSuggestion[]>([])
  const files = new Map<string, { file: File; uploadedId?: string }>()
  provide(filesKey, {
    get: (key) => files.get(key)?.file,
    select: (file) => {
      const key = crypto.randomUUID()
      files.set(key, { file })
      return key
    },
  })
  function withClientId(item: SuggestionDraft): EditableSuggestion {
    return { ...item, _clientId: crypto.randomUUID() }
  }
  function hydrate(items: SuggestionDraft[] = []) {
    wishlist.value = items.map(withClientId)
    const kept = new Set(items.map((s) => s.pendingImage))
    for (const key of files.keys()) if (!kept.has(key)) files.delete(key)
  }
  function add() {
    if (wishlist.value.length < 100) wishlist.value.push(withClientId({ title: '' }))
  }
  watch(
    wishlist,
    (items) => {
      const kept = new Set(items.map((s) => s.pendingImage))
      for (const key of files.keys()) if (!kept.has(key)) files.delete(key)
    },
    { deep: true },
  )
  let uploadController: AbortController | undefined
  function cancelUploads() {
    uploadController?.abort()
  }
  async function uploadImages(base: string, init?: RequestInit) {
    if (uploadController) throw new Error('Upload already running')
    const controller = new AbortController()
    uploadController = controller
    const abort = () => controller.abort()
    init?.signal?.addEventListener('abort', abort, { once: true })
    if (init?.signal?.aborted) abort()
    try {
      for (const item of wishlist.value) {
        if (!item.pendingImage) continue
        const pending = files.get(item.pendingImage)
        if (!pending) throw new Error('Image draft unavailable')
        if (!pending.uploadedId) {
          const form = new FormData()
          form.append('image', pending.file)
          const result = await useApi().upload<{ imageId: string }>(base + '/images', form, {
            ...init,
            signal: controller.signal,
          })
          pending.uploadedId = result.imageId
        }
        item.imageId = pending.uploadedId
      }
    } finally {
      init?.signal?.removeEventListener('abort', abort)
      if (uploadController === controller) uploadController = undefined
    }
  }
  onBeforeUnmount(() => {
    cancelUploads()
    files.clear()
  })
  return { wishlist, withClientId, hydrate, add, uploadImages, cancelUploads }
}
