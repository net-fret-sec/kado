import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { registerPageViews } from '../page-views'

function fixture() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: {} },
      { path: '/exchanges/:id', name: 'exchange-detail', component: {} },
      { path: '/p/:token', name: 'participant-self', component: {} },
      { path: '/blocked', component: {}, beforeEnter: () => false },
      { path: '/:pathMatch(.*)*', name: 'not-found', component: {} },
    ],
  })
  registerPageViews(router)
  const send = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', send)
  return { router, send }
}
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('anonymous page totals', () => {
  it('counts initial home, reload-equivalent initial routes and navigation without identifiers', async () => {
    const { router, send } = fixture()
    await router.push('/')
    await router.push('/p/secret-participant?other=private#note')
    await router.push('/exchanges/private-exchange')
    expect(send.mock.calls.map((call) => JSON.parse(call[1].body))).toEqual([
      { page: 'home' },
      { page: 'participant' },
      { page: 'organizer' },
    ])
    expect(JSON.stringify(send.mock.calls)).not.toMatch(
      /secret-participant|private-exchange|other=|#note/,
    )
    expect(send).toHaveBeenCalledWith(
      '/api/page-views',
      expect.objectContaining({
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        mode: 'same-origin',
      }),
    )
  })
  it('does not count duplicate, cancelled or unknown navigation', async () => {
    const { router, send } = fixture()
    await router.push('/')
    await router.push('/')
    await router.push('/blocked')
    await router.push('/missing')
    expect(send).toHaveBeenCalledTimes(1)
  })
  it.each(['doNotTrack', 'globalPrivacyControl'])('respects %s', async (key) => {
    vi.stubGlobal('navigator', { [key]: key === 'doNotTrack' ? '1' : true })
    const { router, send } = fixture()
    await router.push('/')
    expect(send).not.toHaveBeenCalled()
  })
  it('allows offline navigation without retries or unhandled rejection', async () => {
    const { router, send } = fixture()
    send.mockRejectedValue(new TypeError('offline'))
    await router.push('/')
    expect(router.currentRoute.value.name).toBe('home')
    expect(send).toHaveBeenCalledTimes(1)
  })
})
