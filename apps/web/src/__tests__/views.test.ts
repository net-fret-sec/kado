import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import type { ParticipantSelfViewDto } from '@kado/shared'
import ParticipantSelfView from '../views/ParticipantSelfView.vue'
import ExchangeDetailView from '../views/ExchangeDetailView.vue'
import { i18n, setLocale } from '../i18n'
import { useAdminAuthStore } from '../stores/useAdminAuthStore'

let wrappers: VueWrapper[] = []
const startVersion = '2026-01-01T00:00:00.000Z'
function personal(): ParticipantSelfViewDto {
  return {
    exchange: {
      id: 'exchange',
      name: 'Échange',
      isDrawn: false,
      isArchived: false,
      lockSuggestionsAfterDraw: true,
    },
    participant: {
      id: 'participant',
      name: 'Alex',
      note: 'Initial',
      updatedAt: startVersion,
      wishlist: [{ icon: 'book', title: 'Livre' }],
    },
  }
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status })
}
async function open(
  component: typeof ParticipantSelfView | typeof ExchangeDetailView,
  url: string,
) {
  const pinia = createPinia()
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/p/:token', name: 'participant-self', component },
      { path: '/exchanges/:id', name: 'exchange-detail', component },
      { path: '/x/:id', name: 'exchange-public', component: { render: () => h('div') } },
      { path: '/', name: 'home', component: { render: () => h('div') } },
    ],
  })
  await router.push(url)
  await router.isReady()
  const wrapper = mount(defineComponent({ setup: () => () => h(RouterView) }), {
    global: { plugins: [pinia, router, i18n] },
    attachTo: document.body,
  })
  wrappers.push(wrapper)
  await flushPromises()
  return { wrapper, router, pinia }
}
beforeEach(async () => {
  localStorage.clear()
  await setLocale('fr-CA')
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
})
afterEach(() => {
  for (const wrapper of wrappers) wrapper.unmount()
  wrappers = []
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('participant form regressions', () => {
  it('keeps the icon and sends one write for rapid submit events', async () => {
    const view = personal()
    let writes = 0
    let saved: Record<string, unknown> | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn((_path, init) => {
        if (init.method === 'PUT') {
          writes++
          saved = JSON.parse(init.body)
          return new Promise((resolve) => setTimeout(() => resolve(json(view)), 10))
        }
        return Promise.resolve(json(view))
      }),
    )
    const { wrapper } = await open(ParticipantSelfView, '/p/TEST')
    await wrapper.get('#participant-note').setValue('Draft')
    const first = wrapper.get('form').trigger('submit')
    const second = wrapper.get('form').trigger('submit')
    await Promise.all([first, second])
    expect(writes).toBe(1)
    expect(saved?.wishlist).toEqual([{ title: 'Livre', icon: 'book' }])
    expect(saved?.expectedUpdatedAt).toBe(startVersion)
    await new Promise((resolve) => setTimeout(resolve, 20))
    await flushPromises()
  })
  it('retains the form and its draft after server validation errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_path, init) =>
        Promise.resolve(
          init.method === 'PUT'
            ? json(
                {
                  error: {
                    code: 'INVALID_REQUEST_BODY',
                    details: { fieldErrors: { note: ['Invalid'] } },
                  },
                },
                400,
              )
            : json(personal()),
        ),
      ),
    )
    const { wrapper } = await open(ParticipantSelfView, '/p/TEST')
    await wrapper.get('#participant-note').setValue('Keep me')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect((wrapper.get('#participant-note').element as HTMLTextAreaElement).value).toBe('Keep me')
    expect(wrapper.get('#participant-note').attributes('aria-describedby')).toBe(
      'participant-note-error',
    )
    expect(wrapper.get('[role=alert]').exists()).toBe(true)
  })
  it('preserves dirty values on refresh but displays the newest permissions and recipient', async () => {
    let current = personal()
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(json(current))),
    )
    const { wrapper } = await open(ParticipantSelfView, '/p/TEST')
    await wrapper.get('#participant-note').setValue('Draft')
    current = {
      ...personal(),
      exchange: { ...personal().exchange, isDrawn: true },
      assignment: { receiverName: 'Blair' },
    }
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Actualiser')!
      .trigger('click')
    await flushPromises()
    expect((wrapper.get('#participant-note').element as HTMLTextAreaElement).value).toBe('Draft')
    expect(wrapper.text()).toContain('Blair')
    expect(wrapper.findAll('button[type=submit]')).toHaveLength(0)
    expect(wrapper.findAll('input[type=url]')).toHaveLength(0)
  })
  it('removes cached profiles and assignment after token revocation', async () => {
    let revoked = false
    const current = {
      ...personal(),
      assignment: { receiverName: 'Private recipient' },
      exchange: { ...personal().exchange, isDrawn: true },
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          revoked ? json({ error: { code: 'PARTICIPANT_ACCESS_NOT_FOUND' } }, 404) : json(current),
        ),
      ),
    )
    const { wrapper } = await open(ParticipantSelfView, '/p/TEST')
    expect(wrapper.text()).toContain('Private recipient')
    revoked = true
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Actualiser')!
      .trigger('click')
    await flushPromises()
    expect(wrapper.find('#participant-name').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Private recipient')
  })
  it('does not replace the newest route with an old read response', async () => {
    let oldResolve!: (response: Response) => void
    vi.stubGlobal(
      'fetch',
      vi.fn((path) =>
        String(path).endsWith('/OLD')
          ? new Promise((resolve) => {
              oldResolve = resolve
            })
          : Promise.resolve(
              json({
                ...personal(),
                participant: { ...personal().participant, name: 'New route' },
              }),
            ),
      ),
    )
    const { wrapper, router } = await open(ParticipantSelfView, '/p/OLD')
    await router.push('/p/NEW')
    await flushPromises()
    oldResolve(json(personal()))
    await flushPromises()
    expect((wrapper.get('#participant-name').element as HTMLInputElement).value).toBe('New route')
  })
  it('registers an unload warning only for a modified form', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(json(personal()))),
    )
    const { wrapper } = await open(ParticipantSelfView, '/p/TEST')
    const clean = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(clean)
    expect(clean.defaultPrevented).toBe(false)
    await wrapper.get('#participant-note').setValue('Draft')
    const dirty = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dirty)
    expect(dirty.defaultPrevented).toBe(true)
  })
})

describe('admin authorization and configuration regressions', () => {
  function adminResponse() {
    return {
      id: 'exchange',
      name: 'Échange',
      organizerId: '',
      organizerName: 'Host',
      isDrawn: false,
      isArchived: false,
      createdAt: startVersion,
      updatedAt: startVersion,
      participants: [],
    }
  }
  function seed() {
    localStorage.setItem('kado.adminSessions', JSON.stringify({ exchange: 'old-token' }))
  }
  it('blocks participant addition until failed configuration is recovered', async () => {
    seed()
    let failed = true
    vi.stubGlobal(
      'fetch',
      vi.fn((path) =>
        Promise.resolve(
          String(path).endsWith('/config')
            ? failed
              ? json({ error: { code: 'SERVICE_BUSY' } }, 503)
              : json({ maxActiveParticipants: 7 })
            : String(path).endsWith('/exclusions')
              ? json([])
              : json(adminResponse()),
        ),
      ),
    )
    const { wrapper } = await open(ExchangeDetailView, '/exchanges/exchange')
    expect(
      wrapper.findAll('button').some((button) => /Ajouter.*participant/.test(button.text())),
    ).toBe(false)
    failed = false
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Réessayer la configuration')!
      .trigger('click')
    await flushPromises()
    expect(wrapper.findAll('button').some((button) => button.text().includes('(0/7)'))).toBe(true)
  })
  it('detects an expired session through polling and hides administration', async () => {
    vi.useFakeTimers()
    seed()
    let expired = false
    vi.stubGlobal(
      'fetch',
      vi.fn((path) =>
        Promise.resolve(
          String(path).endsWith('/config')
            ? json({ maxActiveParticipants: 50 })
            : expired
              ? json({ error: { code: 'ADMIN_SESSION_INVALID_OR_EXPIRED' } }, 401)
              : String(path).endsWith('/exclusions')
                ? json([])
                : json(adminResponse()),
        ),
      ),
    )
    const { wrapper } = await open(ExchangeDetailView, '/exchanges/exchange')
    expired = true
    await vi.advanceTimersByTimeAsync(5000)
    await flushPromises()
    expect(wrapper.find('#exchange-admin-password').exists()).toBe(true)
    expect(wrapper.find('#detail').exists()).toBe(false)
  })
  it('ignores a 401 from an older token after a replacement session was installed', async () => {
    seed()
    let oldResolve!: (response: Response) => void
    let first = true
    vi.stubGlobal(
      'fetch',
      vi.fn((path) => {
        if (String(path).endsWith('/config'))
          return Promise.resolve(json({ maxActiveParticipants: 50 }))
        if (String(path).endsWith('/exclusions')) return Promise.resolve(json([]))
        if (first) {
          first = false
          return new Promise((resolve) => {
            oldResolve = resolve
          })
        }
        return Promise.resolve(json(adminResponse()))
      }),
    )
    const { wrapper, pinia } = await open(ExchangeDetailView, '/exchanges/exchange')
    useAdminAuthStore(pinia).setSession('exchange', 'replacement-token')
    oldResolve(json({ error: { code: 'ADMIN_SESSION_INVALID_OR_EXPIRED' } }, 401))
    await flushPromises()
    await nextTick()
    expect(useAdminAuthStore(pinia).getSessionToken('exchange')).toBe('replacement-token')
    expect(wrapper.find('#exchange-admin-password').exists()).toBe(false)
  })
  it('retains inline participant errors and pauses polling while a draft is entered', async () => {
    vi.useFakeTimers()
    seed()
    let reads = 0
    vi.stubGlobal(
      'fetch',
      vi.fn((path, init) => {
        if (init.method === 'POST')
          return Promise.resolve(
            json(
              {
                error: {
                  code: 'INVALID_REQUEST_BODY',
                  details: { fieldErrors: { name: ['Invalid'] } },
                },
              },
              400,
            ),
          )
        reads++
        return Promise.resolve(
          String(path).endsWith('/config')
            ? json({ maxActiveParticipants: 50 })
            : String(path).endsWith('/exclusions')
              ? json([])
              : json(adminResponse()),
        )
      }),
    )
    const { wrapper } = await open(ExchangeDetailView, '/exchanges/exchange')
    await wrapper.get('#new-participant-name').setValue('Draft participant')
    const before = reads
    await vi.advanceTimersByTimeAsync(5000)
    await flushPromises()
    expect(reads).toBe(before)
    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(true)
    await wrapper.findAll('form').find(form => form.find('#new-participant-name').exists())!.trigger('submit')
    await flushPromises()
    expect((wrapper.get('#new-participant-name').element as HTMLInputElement).value).toBe(
      'Draft participant',
    )
    expect(wrapper.get('#new-participant-name').attributes('aria-describedby')).toBe(
      'add-participant-error',
    )
    expect(wrapper.get('#new-participant-name').attributes('aria-invalid')).toBe('true')
  })
  it('keeps password fields after a rejected password change and reports the error in its form', async () => {
    seed()
    vi.stubGlobal(
      'fetch',
      vi.fn((path, init) =>
        Promise.resolve(
          init.method === 'PUT'
            ? json({ error: { code: 'ADMIN_PASSWORD_INVALID' } }, 400)
            : String(path).endsWith('/config')
              ? json({ maxActiveParticipants: 50 })
              : String(path).endsWith('/exclusions')
                ? json([])
                : json(adminResponse()),
        ),
      ),
    )
    const { wrapper } = await open(ExchangeDetailView, '/exchanges/exchange')
    await wrapper.get('#current-admin-password').setValue('currentpassword')
    await wrapper.get('#new-admin-password').setValue('newpassword123')
    await wrapper.get('#confirm-admin-password').setValue('newpassword123')
    await wrapper.findAll('form')[0]!.trigger('submit')
    await flushPromises()
    expect(wrapper.get('#admin-password-error').exists()).toBe(true)
    expect((wrapper.get('#new-admin-password').element as HTMLInputElement).value).toBe(
      'newpassword123',
    )
  })
  it('keeps an admin session in memory if localStorage is blocked', () => {
    const pinia = createPinia()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    const auth = useAdminAuthStore(pinia)
    auth.setSession('exchange', 'in-memory')
    expect(auth.getSessionToken('exchange')).toBe('in-memory')
    auth.clearSession('exchange')
    expect(auth.getSessionToken('exchange')).toBeNull()
  })
})
