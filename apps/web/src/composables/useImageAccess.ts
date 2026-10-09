import { inject, provide, shallowRef, onMounted, type InjectionKey } from 'vue'
import { useApi } from './useApi'
export interface ImageAccess {
  base: string
  headers?: HeadersInit
  scope: string
  onError?: (cause: unknown) => void
}
const accessKey: InjectionKey<(participantId?: string) => ImageAccess | null> =
  Symbol('image-access')
export function provideImageAccess(resolve: (participantId?: string) => ImageAccess | null) {
  provide(accessKey, resolve)
}
export function useImageAccess() {
  return inject(accessKey, () => null)
}
export interface ImageLimits {
  sourceBytes: number
  pixels: number
  dimension: number
  outputBytes: number
  formats: string[]
}
const limits = shallowRef<ImageLimits | null>(null)
const error = shallowRef(false)
let pending: Promise<void> | undefined
export function useImageLimits() {
  async function refresh() {
    if (pending) return pending
    error.value = false
    pending = (async () => {
      try {
        const data = await useApi().get<{ images?: ImageLimits }>('/api/config')
        const v = data.images
        if (
          !v ||
          ![v.sourceBytes, v.pixels, v.dimension, v.outputBytes].every(
            (n) => Number.isSafeInteger(n) && n > 0,
          ) ||
          !Array.isArray(v.formats)
        )
          throw new Error('Invalid image config')
        limits.value = v
      } catch {
        limits.value = null
        error.value = true
      } finally {
        pending = undefined
      }
    })()
    return pending
  }
  onMounted(() => {
    if (!limits.value) void refresh()
  })
  return { limits, error, refresh }
}
