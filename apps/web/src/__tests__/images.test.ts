import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import {
  useWishlist,
  useSuggestionFiles,
  serializeWishlist,
  draftWishlist,
} from '../composables/useWishlist'
import { provideImageAccess } from '../composables/useImageAccess'
import { useApi } from '../composables/useApi'
import WishlistEditor from '../components/WishlistEditor.vue'
import { i18n, setLocale } from '../i18n'
const imageId = 'img_00000000-0000-0000-0000-000000000001'
const config = {
  images: {
    sourceBytes: 1000,
    pixels: 100,
    dimension: 1600,
    outputBytes: 512000,
    formats: ['image/png', 'image/jpeg', 'image/webp'],
  },
}
beforeEach(async () => {
  await setLocale('fr-CA')
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(config))),
  )
  URL.createObjectURL = vi.fn(() => `blob:test-${Math.random()}`)
  URL.revokeObjectURL = vi.fn()
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 8, height: 8, close: vi.fn() })),
  )
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
function fixture(items = [{ title: 'Gift' }] as Array<{ title: string; imageId?: string }>) {
  let draft!: ReturnType<typeof useWishlist>, files!: ReturnType<typeof useSuggestionFiles>
  const child = defineComponent({
    setup() {
      files = useSuggestionFiles()
      return () =>
        h(WishlistEditor, {
          modelValue: draft.wishlist.value,
          'onUpdate:modelValue': (v) => (draft.wishlist.value = v),
        })
    },
  })
  const wrapper = mount(
    defineComponent({
      setup() {
        draft = useWishlist()
        draft.hydrate(items)
        provideImageAccess(() => ({ base: '/api/p/test', scope: 'test' }))
        return () => h(child)
      },
    }),
    { global: { plugins: [i18n] } },
  )
  return {
    wrapper,
    get draft() {
      return draft
    },
    get files() {
      return files
    },
  }
}
async function select(f: ReturnType<typeof fixture>, file: File) {
  const input = f.wrapper.find('input[type=file]')
  Object.defineProperty(input.element, 'files', { configurable: true, value: [file] })
  await input.trigger('change')
  await flushPromises()
}
describe('Image drafts and authenticated previews', () => {
  it('selects and previews locally, uploads only on save, strips local markers', async () => {
    const f = fixture()
    await flushPromises()
    const file = new File(['image'], 'gift.png', { type: 'image/png' })
    await select(f, file)
    expect(f.draft.wishlist.value[0]?.pendingImage).toBeTruthy()
    expect(f.wrapper.find('img').attributes('src')).toMatch(/^blob:/)
    expect(
      vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/images')),
    ).toHaveLength(0)
    expect(draftWishlist(f.draft.wishlist.value)[0]?.pendingImage).toBeTruthy()
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ imageId })))
    await f.draft.uploadImages('/api/p/test')
    expect(serializeWishlist(f.draft.wishlist.value)).toEqual([
      { title: 'Gift', linkUrl: undefined, imageId },
    ])
    const options = vi.mocked(fetch).mock.calls.at(-1)?.[1]
    expect(options?.body).toBeInstanceOf(FormData)
    expect((options!.headers as Headers).has('Content-Type')).toBe(false)
    expect(f.files.get(f.draft.wishlist.value[0]!.pendingImage!)).toBe(file)
    f.wrapper.unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalled()
  })
  it('preserves old image after invalid file, size or pixel validation', async () => {
    const f = fixture([{ title: 'Gift', imageId }])
    await flushPromises()
    for (const file of [
      new File(['x'], 'x.svg', { type: 'image/svg+xml' }),
      new File(['x'.repeat(1001)], 'x.png', { type: 'image/png' }),
    ]) {
      await select(f, file)
      expect(f.draft.wishlist.value[0]?.imageId).toBe(imageId)
      expect(f.draft.wishlist.value[0]?.pendingImage).toBeUndefined()
    }
    vi.mocked(createImageBitmap).mockResolvedValue({
      width: 20,
      height: 20,
      close: vi.fn(),
    } as unknown as ImageBitmap)
    await select(f, new File(['x'], 'large.png', { type: 'image/png' }))
    expect(f.draft.wishlist.value[0]?.imageId).toBe(imageId)
    expect(f.wrapper.text()).toMatch(/limite|volumineuse|invalid/i)
    f.wrapper.unmount()
  })
  it('retains files and successful upload IDs across partial failure and repeated explicit saves', async () => {
    const f = fixture([{ title: 'First' }, { title: 'Second' }])
    await flushPromises()
    f.draft.wishlist.value.forEach(
      (item) =>
        (item.pendingImage = f.files.select(
          new File(['x'], item.title + '.png', { type: 'image/png' }),
        )),
    )
    const send = vi.mocked(fetch)
    send.mockClear()
    send
      .mockResolvedValueOnce(new Response(JSON.stringify({ imageId })))
      .mockRejectedValueOnce(new TypeError('offline'))
    await expect(f.draft.uploadImages('/api/p/test')).rejects.toMatchObject({
      outcomeUncertain: true,
    })
    expect(send).toHaveBeenCalledTimes(2)
    send.mockResolvedValue(new Response(JSON.stringify({ imageId: imageId.replace(/1$/, '2') })))
    await f.draft.uploadImages('/api/p/test')
    expect(send).toHaveBeenCalledTimes(3)
    f.draft.hydrate(draftWishlist(f.draft.wishlist.value))
    await f.draft.uploadImages('/api/p/test')
    expect(send).toHaveBeenCalledTimes(3)
    expect(f.files.get(f.draft.wishlist.value[0]!.pendingImage!)).toBeTruthy()
    f.wrapper.unmount()
  })
  it('removes image explicitly, keeps an empty wishlist and frees abandoned previews', async () => {
    const f = fixture()
    await flushPromises()
    await select(f, new File(['x'], 'gift.png', { type: 'image/png' }))
    const remove = f.wrapper.findAll('button').find((b) => b.text().includes('image'))!
    await remove.trigger('click')
    await nextTick()
    expect(f.draft.wishlist.value[0]?.pendingImage).toBeUndefined()
    expect(f.wrapper.find('img').exists()).toBe(false)
    expect(URL.revokeObjectURL).toHaveBeenCalled()
    f.draft.hydrate([])
    expect(serializeWishlist(f.draft.wishlist.value)).toEqual([])
    f.wrapper.unmount()
  })
  it('reads binary with current authorization, no-store, and aborts without displaying stale data', async () => {
    const send = vi.mocked(fetch)
    send.mockImplementation(
      async () => new Response('webp', { headers: { 'Content-Type': 'image/webp' } }),
    )
    const blob = await useApi().blob('/api/p/test/images/' + imageId, {
      headers: { Authorization: 'Bearer current' },
    })
    expect(blob.size).toBe(4)
    expect(send.mock.calls[0]?.[1]?.cache).toBe('no-store')
    expect((send.mock.calls[0]![1]!.headers as Headers).get('Authorization')).toBe('Bearer current')
    send.mockImplementation(
      (_url, opts) =>
        new Promise((_resolve, reject) =>
          opts?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          ),
        ),
    )
    const f = fixture([{ title: 'Gift', imageId }])
    await nextTick()
    f.wrapper.unmount()
    await flushPromises()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })
  it('bounds uploads at 30 seconds without automatic retries', async () => {
    vi.useFakeTimers()
    const send = vi.mocked(fetch)
    send.mockImplementation(
      (_url, opts) =>
        new Promise((_resolve, reject) =>
          opts?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          ),
        ),
    )
    const promise = expect(
      useApi().upload('/api/p/test/images', new FormData()),
    ).rejects.toMatchObject({ code: 'API_TIMEOUT', outcomeUncertain: true })
    await vi.advanceTimersByTimeAsync(29999)
    expect(send).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await promise
  })
})
