import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import type { ParticipantSelfViewDto, ParticipantDto } from '@kado/shared'
import EditParticipantModal from '../components/EditParticipantModal.vue'
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
      wishlist: [{ imageId: 'img_00000000-0000-4000-8000-000000000001', title: 'Livre' }],
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
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('participant form regressions', () => {
  it('retranslates an invalid participant link on language changes without another request', async () => {
    const fetchMock = vi.fn(async () =>
      json({ error: { code: 'PARTICIPANT_LINK_INVALID_OR_EXPIRED' } }, 404),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { wrapper } = await open(ParticipantSelfView, '/p/INVALID')
    const messages = [
      ['fr-CA', 'Ce lien du participant est invalide ou périmé.'],
      ['en-CA', 'This participant link is invalid or has expired.'],
      ['es', 'Este enlace de participante no es válido o ha caducado.'],
      ['it', 'Questo link del partecipante non è valido o è scaduto.'],
      ['ru', 'Эта ссылка участника недействительна или больше не действует.'],
      ['de', 'Dieser Teilnehmerlink ist ungültig oder abgelaufen.'],
    ] as const
    for (const [locale, message] of messages) {
      await setLocale(locale)
      await flushPromises()
      expect(wrapper.get('[role="alert"]').text()).toBe(message)
    }
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('saves a profile below the required minimum and permits an empty wishlist', async () => {
    const current = personal()
    current.exchange.minWishlistSuggestions = 3
    current.participant.wishlist = []
    const writes: Record<string, unknown>[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_path, init) => {
        if (init.method === 'PUT') {
          const body = JSON.parse(init.body)
          writes.push(body)
          Object.assign(current.participant, body)
        }
        return json(current)
      }),
    )
    const { wrapper } = await open(ParticipantSelfView, '/p/TEST')
    await wrapper.get('#participant-note').setValue('À compléter demain')
    expect(wrapper.find('button[type=submit]').exists()).toBe(false)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(writes).toHaveLength(1)
    expect(writes[0]?.wishlist).toBeUndefined()
    expect(wrapper.text()).toContain('pour la pige seulement')
  })
  it('autosaves a valid profile beside an invalid suggestion and clears an existing message', async () => {
    const current = personal()
    current.participant.wishlist = [{ title: 'Livre' }]
    const writes: Record<string, unknown>[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_path, init) => {
        if (init.method === 'PUT') {
          const body = JSON.parse(init.body)
          writes.push(body)
          Object.assign(current.participant, body)
        }
        return json(current)
      }),
    )
    const { wrapper } = await open(ParticipantSelfView, '/p/TEST')
    vi.useFakeTimers()
    await wrapper.get('input[id$="-title"]').setValue('')
    await wrapper.get('#participant-name').setValue('Nouveau nom')
    await wrapper.get('#participant-name').trigger('blur')
    await vi.advanceTimersByTimeAsync(400)
    await flushPromises()
    expect(writes).toHaveLength(1)
    expect(writes[0]?.name).toBe('Nouveau nom')
    expect(writes[0]?.wishlist).toBeUndefined()
    expect(wrapper.get('.profile-save-status').text()).toContain('Profil enregistré')
    expect(wrapper.get('.participant-profile-card').text()).not.toContain(
      'Indiquez un nom ou une description',
    )
    expect((wrapper.get('input[id$="-title"]').element as HTMLInputElement).value).toBe('')
    await wrapper.get('#participant-note').setValue('')
    await wrapper.get('#participant-note').trigger('blur')
    await vi.advanceTimersByTimeAsync(400)
    expect(writes[1]?.note).toBe('')
    await wrapper.get('#participant-name').setValue('   ')
    await wrapper.get('#participant-name').trigger('blur')
    await vi.advanceTimersByTimeAsync(400)
    expect(writes).toHaveLength(2)
    expect(wrapper.get('#participant-name').attributes('aria-invalid')).toBe('true')
  })
  it('serializes profile and suggestion autosaves using the latest version', async () => {
    const current = personal()
    current.participant.wishlist = [{ title: 'Livre' }]
    const writes: Record<string, unknown>[] = []
    let finish!: () => void
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_path, init) => {
        if (init.method === 'PUT') {
          const body = JSON.parse(init.body)
          writes.push(body)
          if (writes.length === 1)
            await new Promise<void>((resolve) => {
              finish = resolve
            })
          Object.assign(current.participant, body, {
            updatedAt: `2026-01-0${writes.length + 1}T00:00:00.000Z`,
          })
        }
        return json(current)
      }),
    )
    const { wrapper } = await open(ParticipantSelfView, '/p/TEST')
    vi.useFakeTimers()
    await wrapper.get('#participant-note').setValue('Message')
    await wrapper.get('#participant-note').trigger('blur')
    await wrapper.get('input[id$="-title"]').setValue('Autre livre')
    await wrapper.get('.suggestion-shell').trigger('focusout')
    await vi.advanceTimersByTimeAsync(400)
    expect(writes).toHaveLength(1)
    finish()
    await flushPromises()
    expect(writes).toHaveLength(2)
    expect(writes[1]?.expectedUpdatedAt).toBe('2026-01-02T00:00:00.000Z')
    expect(wrapper.get('.profile-save-status').text()).toContain('Profil enregistré')
    expect(wrapper.get('.suggestion-save-status').text()).toContain('Suggestions enregistrées')
  })
  it('autosaves suggestions without saving a profile draft, then deletes the last suggestion below the minimum', async () => {
    const current = personal()
    current.exchange.minWishlistSuggestions = 3
    current.participant.wishlist = [{ title: 'Livre' }]
    const writes: Record<string, unknown>[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_path, init) => {
        if (init.method === 'PUT') {
          const body = JSON.parse(init.body)
          writes.push(body)
          Object.assign(current.participant, body, { updatedAt: '2026-01-02T00:00:00.000Z' })
        }
        return json(current)
      }),
    )
    const { wrapper } = await open(ParticipantSelfView, '/p/TEST')
    vi.useFakeTimers()
    await wrapper.get('#participant-note').setValue('Profil en brouillon')
    await wrapper.get('input[id$="-title"]').setValue('Nouveau livre')
    await wrapper.get('.suggestion-shell').trigger('focusout')
    await vi.advanceTimersByTimeAsync(400)
    await flushPromises()
    expect(writes).toHaveLength(1)
    expect(Object.keys(writes[0]!)).toEqual(['wishlist', 'expectedUpdatedAt'])
    expect(writes[0]?.wishlist).toEqual([{ title: 'Nouveau livre' }])
    expect((wrapper.get('#participant-note').element as HTMLTextAreaElement).value).toBe(
      'Profil en brouillon',
    )
    expect(wrapper.get('.suggestion-save-status').text()).toContain('Suggestions enregistrées')
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await wrapper.get('.suggestion-controls .btn-outline-danger').trigger('click')
    await vi.advanceTimersByTimeAsync(400)
    await flushPromises()
    expect(writes).toHaveLength(2)
    expect(writes[1]?.wishlist).toEqual([])
    expect(writes[1]?.expectedUpdatedAt).toBe('2026-01-02T00:00:00.000Z')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(writes[2]?.note).toBe('Profil en brouillon')
  })
  it('keeps invalid suggestions as drafts and exposes an explicit retry after a failed autosave', async () => {
    const current = personal()
    current.participant.wishlist = [{ title: 'Livre' }]
    let fail = true,
      writes = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_path, init) => {
        if (init.method === 'PUT') {
          writes++
          if (fail) return json({ error: { code: 'API_UNAVAILABLE' } }, 503)
          Object.assign(current.participant, JSON.parse(init.body))
        }
        return json(current)
      }),
    )
    const { wrapper } = await open(ParticipantSelfView, '/p/TEST')
    vi.useFakeTimers()
    await wrapper.get('input[id$="-title"]').setValue('')
    await wrapper.get('.suggestion-shell').trigger('focusout')
    await vi.advanceTimersByTimeAsync(400)
    expect(writes).toBe(0)
    await wrapper.get('input[id$="-title"]').setValue('Mon brouillon')
    await wrapper.get('.suggestion-shell').trigger('focusout')
    await vi.advanceTimersByTimeAsync(400)
    await flushPromises()
    expect(writes).toBe(1)
    expect(wrapper.get('.suggestion-save-status').text()).toContain(
      'n’ont pas pu être enregistrées',
    )
    expect((wrapper.get('input[id$="-title"]').element as HTMLInputElement).value).toBe(
      'Mon brouillon',
    )
    await vi.advanceTimersByTimeAsync(10000)
    expect(writes).toBe(1)
    fail = false
    await wrapper.get('.suggestion-save-status button').trigger('click')
    await vi.advanceTimersByTimeAsync(400)
    await flushPromises()
    expect(writes).toBe(2)
    expect(wrapper.get('.suggestion-save-status').text()).toContain('Suggestions enregistrées')
  })
  it('requires conflict resolution instead of overwriting a remotely edited suggestion', async () => {
    let current = personal()
    current.participant.wishlist = [{ title: 'Livre' }]
    let writes = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_path, init) => {
        if (init.method === 'PUT') {
          writes++
          current = {
            ...current,
            participant: {
              ...current.participant,
              wishlist: [{ title: 'Autre session' }],
              updatedAt: '2026-01-03T00:00:00.000Z',
            },
          }
          return json({ error: { code: 'RESOURCE_MODIFIED_CONCURRENTLY' } }, 409)
        }
        return json(current)
      }),
    )
    const { wrapper } = await open(ParticipantSelfView, '/p/TEST')
    vi.useFakeTimers()
    await wrapper.get('input[id$="-title"]').setValue('Mon choix')
    await wrapper.get('.suggestion-shell').trigger('focusout')
    await vi.advanceTimersByTimeAsync(400)
    await flushPromises()
    expect(wrapper.text()).toContain('Autre session')
    expect((wrapper.get('input[id$="-title"]').element as HTMLInputElement).value).toBe('Mon choix')
    await vi.advanceTimersByTimeAsync(10000)
    expect(writes).toBe(1)
  })
  it('keeps the image reference and sends one write for rapid submit events', async () => {
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
    expect(saved?.wishlist).toBeUndefined()
    expect(saved?.note).toBe('Draft')
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
    document.dispatchEvent(new Event('visibilitychange'))
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
    document.dispatchEvent(new Event('visibilitychange'))
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
  it('centralizes directional exclusions without creating a reverse rule', async () => {
    seed()
    const data = {
      ...adminResponse(),
      participants: [
        { id: 'dave', name: 'Dave', status: 'active', wishlist: [] },
        { id: 'stephane', name: 'Stéphane', status: 'active', wishlist: [] },
        { id: 'alex', name: 'Alex', status: 'active', wishlist: [] },
      ],
    }
    const rules = [{ id: 'rule', giverParticipantId: 'dave', receiverParticipantId: 'stephane' }]
    const writes: unknown[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn((path, init) => {
        if (init?.method === 'DELETE') return Promise.resolve(new Response(null, { status: 204 }))
        if (init?.method === 'PUT')
          throw new Error('Exclusions must not write the participant profile')
        if (init?.method === 'POST') {
          writes.push(JSON.parse(init.body))
          return Promise.resolve(json({ id: 'new-rule', ...JSON.parse(init.body) }))
        }
        return Promise.resolve(
          json(
            String(path).endsWith('/config')
              ? { maxActiveParticipants: 50 }
              : String(path).endsWith('/exclusions')
                ? rules
                : data,
          ),
        )
      }),
    )
    const { wrapper } = await open(ExchangeDetailView, '/exchanges/exchange')
    expect(wrapper.find('#exchange-view-mode-switch').exists()).toBe(false)
    expect(wrapper.find('a[href^="/x/"]').exists()).toBe(false)
    expect(wrapper.findAll('#participants select')).toHaveLength(0)
    expect(wrapper.findAll('#exchange-details select')).toHaveLength(0)
    expect(wrapper.findAll('#participants li strong').map((p) => p.text())).toEqual([
      'Alex',
      'Dave',
      'Stéphane',
    ])
    const edit = wrapper
      .findAll('#participants li')
      .find((p) => p.text().includes('Dave'))!
      .findAll('button')
      .find((b) => b.text() === 'Modifier')!
    await edit.trigger('click')
    await flushPromises()
    const select = document.querySelector<HTMLSelectElement>('#exclusion-receiver')!
    expect([...select.options].map((o) => o.value)).toEqual(['', 'alex'])
    select.value = 'alex'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await nextTick()
    select.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(writes).toEqual([{ giverParticipantId: 'dave', receiverParticipantId: 'alex' }])
    expect(wrapper.text()).toContain('Dave ne peut pas piger Alex et Stéphane.')
    expect(document.querySelector('.modal-save-feedback')).toBeNull()
    expect(document.querySelector('.participant-close')?.textContent?.trim()).toBe('Fermer')
    expect(
      document
        .querySelector('.participant-close')
        ?.closest('.modal-footer')
        ?.querySelectorAll('button'),
    ).toHaveLength(1)
    const remove = [...document.querySelectorAll<HTMLButtonElement>('.modal li button')].find(
      (button) => button.closest('li')?.textContent?.includes('Alex'),
    )!
    remove.click()
    await flushPromises()
    expect(document.querySelector('.modal-save-feedback')).toBeNull()
    expect(document.querySelector('.participant-close')?.textContent?.trim()).toBe('Fermer')
    expect(document.querySelector('#editParticipantName')?.getAttribute('disabled')).toBeNull()
  })
  it.each([
    { drawn: true, archived: false },
    { drawn: true, archived: true },
  ])('locks centralized rules for %j', async ({ drawn, archived }) => {
    seed()
    const data = { ...adminResponse(), isDrawn: drawn, isArchived: archived }
    vi.stubGlobal(
      'fetch',
      vi.fn((path) =>
        Promise.resolve(
          json(
            String(path).endsWith('/config')
              ? { maxActiveParticipants: 50 }
              : String(path).endsWith('/exclusions')
                ? [{ id: 'rule', giverParticipantId: 'a', receiverParticipantId: 'b' }]
                : data,
          ),
        ),
      ),
    )
    const { wrapper } = await open(ExchangeDetailView, '/exchanges/exchange')
    expect(wrapper.find('#exclusion-giver').exists()).toBe(false)
    expect(wrapper.findAll('#exchange-details li button')).toHaveLength(0)
    expect(wrapper.find('#exclusion-receiver').exists()).toBe(false)
    expect(wrapper.text()).toContain('La pige a été effectuée')
  })
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
    expect(wrapper.find('#new-participant-name').exists()).toBe(false)
    failed = false
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Actualiser la configuration')!
      .trigger('click')
    await flushPromises()
    expect(wrapper.find('#new-participant-name').exists()).toBe(true)
    expect(wrapper.get('#participants button[type=submit]').text()).toBe('Ajouter')
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
    await wrapper
      .findAll('form')
      .find((form) => form.find('#new-participant-name').exists())!
      .trigger('submit')
    await flushPromises()
    expect((wrapper.get('#new-participant-name').element as HTMLInputElement).value).toBe(
      'Draft participant',
    )
    expect(wrapper.get('#new-participant-name').attributes('aria-describedby')).toBe(
      'add-participant-error',
    )
    expect(wrapper.get('#new-participant-name').attributes('aria-invalid')).toBe('true')
  })
  it('requires the exact exchange name before deleting and hides password-change UI', async () => {
    seed()
    const writes: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn((path, init) => {
        if (init.method === 'DELETE') {
          writes.push(String(path))
          return Promise.resolve(new Response(null, { status: 204 }))
        }
        return Promise.resolve(
          json(
            String(path).endsWith('/config')
              ? { maxActiveParticipants: 50 }
              : String(path).endsWith('/exclusions')
                ? []
                : adminResponse(),
          ),
        )
      }),
    )
    const { wrapper, router } = await open(ExchangeDetailView, '/exchanges/exchange')
    expect(wrapper.find('#admin-password-form').exists()).toBe(false)
    expect(wrapper.findAll('button').some((b) => b.text() === 'Actualiser')).toBe(false)
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Supprimer l’échange')!
      .trigger('click')
    await flushPromises()
    const input = document.querySelector<HTMLInputElement>('#delete-exchange-name')!
    const form = input.closest('form')!
    const submit = document.querySelector<HTMLButtonElement>('button[form="delete-exchange-form"]')!
    expect(submit.disabled).toBe(true)
    input.value = 'échange'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(writes).toEqual([])
    input.value = 'Échange'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    expect(submit.disabled).toBe(false)
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(writes).toEqual(['/api/exchanges/exchange'])
    expect(router.currentRoute.value.name).toBe('home')
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

describe('participant modal autosave and closure', () => {
  async function modal(
    saveParticipant: (payload: Record<string, unknown>) => Promise<ParticipantDto | undefined>,
  ) {
    const participant = {
      id: 'p',
      exchangeId: 'e',
      name: 'Alex',
      note: 'Initial',
      status: 'active',
      createdAt: startVersion,
      updatedAt: startVersion,
      wishlist: [{ title: 'Livre' }],
    } as ParticipantDto
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { render: () => h('div') } }],
    })
    await router.push('/')
    const wrapper = mount(EditParticipantModal, {
      props: { modelValue: false, participant, saveParticipant },
      global: {
        plugins: [i18n, router],
        stubs: {
          BaseModal: { template: '<div><slot/><footer><slot name="footer"/></footer></div>' },
        },
      },
    })
    wrappers.push(wrapper)
    await wrapper.setProps({ modelValue: true })
    return { wrapper, participant }
  }
  it('saves valid profile changes before asking to discard an incomplete suggestion', async () => {
    const save = vi.fn<(payload: Record<string, unknown>) => Promise<ParticipantDto>>()
    const { wrapper, participant } = await modal(save)
    save.mockImplementation(
      async (payload) =>
        ({ ...participant, ...payload, updatedAt: '2026-01-02T00:00:00.000Z' }) as ParticipantDto,
    )
    vi.useFakeTimers()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await wrapper.get('input[id$="-title"]').setValue('')
    await wrapper.get('#editParticipantNote').setValue('Nouveau message')
    expect(wrapper.get('.participant-close').text()).toBe('Enregistrer et fermer')
    await wrapper.get('.participant-close').trigger('click')
    await flushPromises()
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0]![0]).toEqual({
      name: 'Alex',
      note: 'Nouveau message',
      expectedUpdatedAt: startVersion,
    })
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.get('.participant-close').text()).toBe('Fermer')
    expect(wrapper.get('.profile-save-status').text()).toContain('Profil enregistré')
    confirm.mockReturnValue(true)
    await wrapper.get('.participant-close').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    expect(save).toHaveBeenCalledTimes(1)
  })
  it('waits for the write and stays open on failure, then retries and closes', async () => {
    let resolve!: (participant: ParticipantDto | undefined) => void
    const save = vi.fn(
      () =>
        new Promise<ParticipantDto | undefined>((done) => {
          resolve = done
        }),
    )
    const { wrapper, participant } = await modal(save)
    vi.useFakeTimers()
    await wrapper.get('#editParticipantName').setValue('Autre nom')
    await wrapper.get('.participant-close').trigger('click')
    expect(wrapper.get('.participant-close').text()).toBe('Enregistrement…')
    expect(wrapper.get('.participant-close').attributes('disabled')).toBeDefined()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    resolve(undefined)
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.get('.profile-save-status').text()).toContain('n’a pas pu être enregistré')
    await wrapper.get('.participant-close').trigger('click')
    resolve({ ...participant, name: 'Autre nom', updatedAt: '2026-01-02T00:00:00.000Z' })
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    expect(save).toHaveBeenCalledTimes(2)
  })
  it('autosaves on blur without closing and keeps an invalid suggestion as a draft', async () => {
    const save = vi.fn<(payload: Record<string, unknown>) => Promise<ParticipantDto>>()
    const { wrapper, participant } = await modal(save)
    save.mockImplementation(async (payload) => ({ ...participant, ...payload }) as ParticipantDto)
    vi.useFakeTimers()
    await wrapper.get('input[id$="-title"]').setValue('')
    await wrapper.get('#editParticipantNote').setValue('')
    await wrapper.get('#editParticipantNote').trigger('blur')
    await vi.advanceTimersByTimeAsync(400)
    await flushPromises()
    expect(save.mock.calls[0]![0].note).toBe('')
    expect(save.mock.calls[0]![0].wishlist).toBeUndefined()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.get('.participant-close').text()).toBe('Fermer')
    expect(wrapper.findAll('footer button')).toHaveLength(1)
    expect(wrapper.find('.modal-save-feedback').exists()).toBe(false)
  })
})
