import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, ref, nextTick } from 'vue'
import { useApi, HttpError, parseRetryAfter, REQUEST_TIMEOUT_MS } from '../composables/useApi'
import { compareVersions, useConflict, equal } from '../composables/useConflict'
import { serializeWishlist, isValidSuggestion } from '../composables/useWishlist'
import { readStorage, writeStorage, storageUnavailable } from '../composables/useStorage'
import { useRefresh } from '../composables/useRefresh'
import { copyText } from '../composables/useClipboard'
import WishlistEditor from '../components/WishlistEditor.vue'
import BaseModal from '../components/BaseModal.vue'
import { i18n, setLocale } from '../i18n'

beforeEach(async () => {
  await setLocale('fr-CA')
  storageUnavailable.value = false
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('API interruptions and backpressure', () => {
  it('accepts numeric and HTTP-date Retry-After and ignores invalid values', () => {
    expect(parseRetryAfter('30', 0)).toBe(30_000)
    expect(parseRetryAfter('Thu, 01 Jan 1970 00:01:00 GMT', 0)).toBe(60_000)
    expect(parseRetryAfter('garbage')).toBeUndefined()
    expect(parseRetryAfter(null)).toBeUndefined()
    expect(parseRetryAfter('-1')).toBeUndefined()
    expect(parseRetryAfter(' ')).toBeUndefined()
  })
  it.each([429, 503])('preserves status %s, code and Retry-After without retry', async (status) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: { code: 'RATE_LIMITED' } }), {
          status,
          headers: { 'Retry-After': '10' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)
    await expect(useApi().post('/api/example', {})).rejects.toMatchObject({
      status,
      code: 'RATE_LIMITED',
      retryAfterMs: 10_000,
      outcomeUncertain: false,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('reports an uncertain write after network interruption, never retries', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('offline'))
    vi.stubGlobal('fetch', fetchMock)
    await expect(useApi().put('/api/example', {})).rejects.toMatchObject({
      status: 0,
      code: 'API_UNAVAILABLE',
      outcomeUncertain: true,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('times out at 15 seconds through the full response body', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, opts) =>
          new Promise((_resolve, reject) =>
            opts.signal.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            ),
          ),
      ),
    )
    const result = expect(useApi().get('/api/example')).rejects.toMatchObject({
      code: 'API_TIMEOUT',
      outcomeUncertain: false,
    })
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS)
    await result
  })
  it('distinguishes caller cancellation from unavailability', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, opts) =>
          new Promise((_resolve, reject) =>
            opts.signal.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            ),
          ),
      ),
    )
    const controller = new AbortController()
    const result = expect(
      useApi().get('/api/example', { signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'REQUEST_ABORTED' })
    controller.abort()
    await result
  })
  it('uses no-store for personal reads', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)
    await useApi().get('/api/p/code')
    expect(fetchMock.mock.calls[0]?.[1].cache).toBe('no-store')
  })
})

describe('three-way conflict resolution', () => {
  it('ignores PostgreSQL JSON object key order while preserving wish order', () => {
    expect(
      equal([{ icon: 'gift', title: 'A' }], [{ title: 'A', icon: 'gift', linkUrl: undefined }]),
    ).toBe(true)
    expect(equal(['A', 'B'], ['B', 'A'])).toBe(false)
  })
  it('merges independent changes without forcing a choice', () => {
    expect(
      compareVersions(
        { name: 'A', note: 'old' },
        { name: 'B', note: 'old' },
        { name: 'A', note: 'new' },
      ),
    ).toEqual({ merged: { name: 'B', note: 'new' }, fields: [] })
  })
  it('requires a choice for competing values, treating wishes atomically', () => {
    const result = compareVersions(
      { wishlist: [{ title: 'A' }] },
      { wishlist: [{ title: 'B' }] },
      { wishlist: [{ title: 'C' }] },
    )
    expect(result.fields).toHaveLength(1)
    expect(result.fields[0]?.key).toBe('wishlist')
  })
  it('adopts server values for locked fields', () => {
    expect(compareVersions({ name: 'A' }, { name: 'B' }, { name: 'C' }, ['name'])).toEqual({
      merged: { name: 'C' },
      fields: [],
    })
  })
  it('rebases only after all conflicting choices and supports a second conflict', () => {
    const conflict = useConflict()
    conflict.baseline.value = { name: 'A' }
    conflict.open({ name: 'B' }, { name: 'C' })
    expect(conflict.apply()).toBeNull()
    conflict.choices.value.name = 'local'
    expect(conflict.apply()).toEqual({ name: 'B' })
    expect(conflict.baseline.value).toEqual({ name: 'C' })
    conflict.open({ name: 'B' }, { name: 'D' })
    expect(conflict.ready.value).toBe(false)
  })
})

describe('wishlist parity and accessibility', () => {
  it('serializes every domain field and preserves order without client IDs', () => {
    const items = [
      {
        title: 'Second',
        icon: 'gift',
        imageUrl: 'https://image.test/a',
        linkUrl: 'https://shop.test/a',
        _clientId: '2',
      },
      { title: 'First', icon: 'book', _clientId: '1' },
    ]
    expect(serializeWishlist(items)).toEqual([
      {
        title: 'Second',
        icon: 'gift',
        imageUrl: 'https://image.test/a',
        linkUrl: 'https://shop.test/a',
      },
      { title: 'First', icon: 'book', imageUrl: undefined, linkUrl: undefined },
    ])
  })
  it.each([
    { title: '' },
    { title: 'a'.repeat(201) },
    { title: 'A', imageUrl: 'javascript:alert(1)' },
    { title: 'A', linkUrl: 'https://shop.test/' + 'a'.repeat(2048) },
    { title: 'A', icon: 'a'.repeat(51) },
  ])('rejects invalid shared-schema wish %j', (value) => {
    expect(isValidSuggestion(value)).toBe(false)
  })
  it('accepts the server HTTP/HTTPS contract', () => {
    expect(
      isValidSuggestion({
        title: 'Book',
        imageUrl: 'http://image.test/a',
        linkUrl: 'https://shop.test',
      }),
    ).toBe(true)
  })
  it('reorders wishes through keyboard-operable buttons and announces position', async () => {
    const wrapper = mount(WishlistEditor, {
      props: {
        modelValue: [
          { title: 'A', icon: 'book', _clientId: 'a' },
          { title: 'B', icon: 'gift', _clientId: 'b' },
        ],
      },
      global: { plugins: [i18n] },
    })
    const button = wrapper.findAll('button').find((button) => button.text() === 'Descendre')!
    await button.trigger('click')
    expect(
      (wrapper.emitted('update:modelValue')![0]![0] as { title: string }[]).map(
        (item) => item.title,
      ),
    ).toEqual(['B', 'A'])
    expect(wrapper.get('[role=status]').text()).toContain('2')
    wrapper.unmount()
  })
  it('has unique labels and presents locked wishes without editable controls', () => {
    const wrapper = mount(WishlistEditor, {
      props: {
        modelValue: [
          { title: 'A', _clientId: 'a' },
          { title: 'B', _clientId: 'b' },
        ],
      },
      global: { plugins: [i18n] },
    })
    const ids = wrapper.findAll('input[id]').map((input) => input.attributes('id'))
    expect(new Set(ids).size).toBe(ids.length)
    for (const input of wrapper.findAll('input[id]'))
      expect(wrapper.find(`label[for="${input.attributes('id')}"]`).exists()).toBe(true)
    wrapper.unmount()
    const locked = mount(WishlistEditor, {
      props: { locked: true, modelValue: [{ title: 'A', icon: 'book', _clientId: 'a' }] },
      global: { plugins: [i18n] },
    })
    expect(locked.findAll('input, button')).toHaveLength(0)
    locked.unmount()
  })
})

describe('refresh lifecycle', () => {
  function fixture(load: (signal: AbortSignal) => Promise<void>, interval?: number) {
    const enabled = ref(true)
    let refresh!: ReturnType<typeof useRefresh>
    const wrapper = mount(
      defineComponent({
        setup() {
          refresh = useRefresh(load, enabled, interval)
          return () => h('div')
        },
      }),
    )
    return { wrapper, refresh, enabled }
  }
  it('does not overlap requests and pauses when hidden or disabled', async () => {
    let resolve!: () => void
    const load = vi.fn(
      () =>
        new Promise<void>((done) => {
          resolve = done
        }),
    )
    const f = fixture(load)
    const request = f.refresh.refresh()
    await f.refresh.refresh()
    expect(load).toHaveBeenCalledTimes(1)
    resolve()
    await request
    f.enabled.value = false
    await f.refresh.refresh()
    expect(load).toHaveBeenCalledTimes(1)
    f.wrapper.unmount()
  })
  it('backs off, honors Retry-After and returns to nominal interval after success', async () => {
    vi.useFakeTimers()
    const load = vi
      .fn()
      .mockRejectedValueOnce(new HttpError('busy', 503, null, 'SERVICE_BUSY', 40_000))
      .mockResolvedValue(undefined)
    const f = fixture(load, 5000)
    await f.refresh.refresh(false)
    expect(f.refresh.paused.value).toBe(true)
    await vi.advanceTimersByTimeAsync(39_999)
    expect(load).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(load).toHaveBeenCalledTimes(2)
    expect(f.refresh.paused.value).toBe(false)
    await vi.advanceTimersByTimeAsync(5000)
    expect(load).toHaveBeenCalledTimes(3)
    f.wrapper.unmount()
  })
  it('refreshes on return to a tab without a periodic timer for public views', async () => {
    vi.useFakeTimers()
    const load = vi.fn().mockResolvedValue(undefined)
    const f = fixture(load)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(load).not.toHaveBeenCalled()
    document.dispatchEvent(new Event('visibilitychange'))
    await nextTick()
    expect(load).toHaveBeenCalledTimes(1)
    f.wrapper.unmount()
  })
  it('cancels and permits a new generation without a stale error changing its state', async () => {
    let reject!: (cause: unknown) => void
    const load = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((_resolve, fail) => {
            reject = fail
          }),
      )
      .mockResolvedValue(undefined)
    const f = fixture(load)
    const first = f.refresh.refresh(false)
    f.refresh.cancel(true)
    await f.refresh.refresh()
    reject(new HttpError('offline', 0, null, 'API_UNAVAILABLE'))
    await first
    expect(f.refresh.paused.value).toBe(false)
    f.wrapper.unmount()
  })
})

describe('unavailable device facilities', () => {
  it('keeps storage errors out of successful API paths', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    expect(readStorage('session')).toBeNull()
    expect(() => writeStorage('session', 'value')).not.toThrow()
    expect(storageUnavailable.value).toBe(true)
  })
  it('reports clipboard failure without throwing or leaving the fallback element', async () => {
    vi.stubGlobal('isSecureContext', true)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    })
    expect(await copyText('secret test link')).toBe(false)
    expect(document.querySelector('textarea')).toBeNull()
  })
})


describe('modal close guards', () => {
  it('guards user dismissal but permits controlled closing after a save', async () => {
    vi.useFakeTimers()
    const guard = vi.fn(() => false)
    const wrapper = mount(BaseModal, { props: { modelValue: false, beforeClose: guard, title: 'Editor' }, global: { plugins: [i18n] }, attachTo: document.body })
    await wrapper.setProps({ modelValue: true })
    await vi.runAllTimersAsync()
    const userDismissal = new Event('hide.bs.modal', { cancelable: true })
    wrapper.element.dispatchEvent(userDismissal)
    expect(userDismissal.defaultPrevented).toBe(true)
    expect(guard).toHaveBeenCalledTimes(1)
    await wrapper.setProps({ modelValue: false })
    await vi.runAllTimersAsync()
    const saved = new Event('hide.bs.modal', { cancelable: true })
    wrapper.element.dispatchEvent(saved)
    expect(saved.defaultPrevented).toBe(false)
    expect(guard).toHaveBeenCalledTimes(1)
    wrapper.unmount()
    document.body.innerHTML = ''
  })
})
