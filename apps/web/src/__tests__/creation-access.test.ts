import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { createPinia } from 'pinia'
import CreateExchangeModal from '../components/CreateExchangeModal.vue'
import AccessReminder from '../components/AccessReminder.vue'
import { i18n, setLocale, SUPPORT_LOCALES } from '../i18n'
import { useAdminAuthStore } from '../stores/useAdminAuthStore'
import { useToastsStore } from '../stores/toasts'

let wrapper: VueWrapper | undefined
beforeEach(async () => {
  localStorage.clear()
  await setLocale('fr-CA')
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
  document.body.className = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const created = { exchange: { id: 'new-exchange', name: 'Famille' }, adminSessionToken: 'session' }
async function openCreation() {
  const page = defineComponent({
    setup() {
      const open = ref(false)
      return () => [
        h(
          'button',
          {
            id: 'open',
            onClick: () => {
              open.value = true
            },
          },
          'Create',
        ),
        h(CreateExchangeModal, {
          modelValue: open.value,
          'onUpdate:modelValue': (value: boolean) => {
            open.value = value
          },
        }),
      ]
    },
  })
  const pinia = createPinia()
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: page },
      {
        path: '/exchanges/:id',
        name: 'exchange-detail',
        component: { render: () => h('div', 'Destination') },
      },
    ],
  })
  await router.push('/')
  await router.isReady()
  wrapper = mount(defineComponent({ setup: () => () => h(RouterView) }), {
    attachTo: document.body,
    global: { plugins: [pinia, router, i18n] },
  })
  wrapper.get<HTMLButtonElement>('#open').element.focus()
  await wrapper.get('#open').trigger('click')
  await flushPromises()
  return { router, pinia, view: wrapper }
}
async function fillCreation(view: VueWrapper) {
  await view.get('#exchangeName').setValue('Famille')
  await view.get('#organizerName').setValue('Alex')
  await view.get('#adminPassword').setValue('password123')
}

describe('creation and immediate organizer access', () => {
  it('closes an empty form with Escape and returns focus', async () => {
    const { view } = await openCreation()
    expect(view.get('.modal').classes()).toContain('show')
    await view.get('#exchangeName').trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(view.get('.modal').classes()).not.toContain('show')
    expect(document.activeElement).toBe(view.get('#open').element)
  })

  it('protects a draft on Escape and uses the same confirmation for the discard button', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { view } = await openCreation()
    await view.get('#exchangeName').setValue('Brouillon')
    await view.get('#exchangeName').trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(view.get('.modal').classes()).toContain('show')
    expect(view.get<HTMLInputElement>('#exchangeName').element.value).toBe('Brouillon')
    confirm.mockReturnValue(true)
    expect(view.get('[data-bs-dismiss="modal"]').text()).toBe(
      i18n.global.t('actions.discardChanges'),
    )
    await view.get('[data-bs-dismiss="modal"]').trigger('click')
    await flushPromises()
    expect(confirm).toHaveBeenCalledTimes(2)
    expect(view.get('.modal').classes()).not.toContain('show')
    await view.get('#open').trigger('click')
    expect(view.get<HTMLInputElement>('#exchangeName').element.value).toBe('')
  })

  it('keeps the form open while submitting, then navigates once without a success step or discard prompt', async () => {
    let respond!: (response: Response) => void
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          respond = resolve
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { view, router, pinia } = await openCreation()
    await fillCreation(view)
    await view.get('form').trigger('submit')
    await view.get('#exchangeName').trigger('keydown', { key: 'Escape' })
    await view.get('form').trigger('submit')
    expect(view.get('.modal').classes()).toContain('show')
    expect(view.get('[data-bs-dismiss="modal"]').attributes('disabled')).toBeDefined()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    respond(new Response(JSON.stringify(created), { status: 201 }))
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/exchanges/new-exchange')
    expect(useAdminAuthStore(pinia).getSessionToken('new-exchange')).toBe('session')
    expect(document.querySelector('.modal-backdrop')).toBeNull()
    expect(document.body.classList.contains('modal-open')).toBe(false)
    expect(confirm).not.toHaveBeenCalled()
  })

  it('preserves fields and displays an API failure, allowing a successful retry', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: 'INTERNAL_ERROR' } }), { status: 500 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(created), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const { view, router } = await openCreation()
    await fillCreation(view)
    await view.get('form').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/')
    expect(view.get('[role="alert"]').text()).not.toBe('')
    expect(view.get<HTMLInputElement>('#exchangeName').element.value).toBe('Famille')
    expect(view.get<HTMLInputElement>('#adminPassword').element.value).toBe('password123')
    expect(view.get('button[type="submit"]').attributes('disabled')).toBeUndefined()
    await view.get('form').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/exchanges/new-exchange')
  })
})

function openReminder(organizer = true, accessId = 'one') {
  const pinia = createPinia()
  wrapper = mount(AccessReminder, {
    props: { accessId, organizer, link: 'https://example.test/exchanges/one' },
    attachTo: document.body,
    global: { plugins: [pinia, i18n] },
  })
  return { view: wrapper, toasts: useToastsStore(pinia) }
}

describe('access reminder', () => {
  it.each(SUPPORT_LOCALES)(
    'distinguishes organizer confirmation from a personal link in %s',
    async (locale) => {
      await setLocale(locale)
      const { view } = openReminder()
      expect(view.get('.access-reminder-confirm').text()).toBe(i18n.global.t('review.accessSaved'))
      expect(view.get('label').text()).toBe(i18n.global.t('review.organizerLinkLabel'))
      await view.setProps({ organizer: false })
      expect(view.find('input').exists()).toBe(false)
      expect(view.get('.access-reminder-confirm').text()).toBe(
        i18n.global.t('review.participantLinkSaved'),
      )
    },
  )

  it('copies the displayed organizer link without dismissing the reminder and reflects a different exchange', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('isSecureContext', true)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const { view, toasts } = openReminder()
    await view.get('.input-group button').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenLastCalledWith('https://example.test/exchanges/one')
    expect(toasts.items.at(-1)?.variant).toBe('success')
    expect(view.find('aside').exists()).toBe(true)
    await view.setProps({ accessId: 'two', link: 'https://example.test/exchanges/two' })
    await view.get('.input-group button').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenLastCalledWith('https://example.test/exchanges/two')
    expect(view.get<HTMLInputElement>('input').element.value).toBe(
      'https://example.test/exchanges/two',
    )
  })

  it('selects the link for manual copying when clipboard methods fail', async () => {
    vi.stubGlobal('isSecureContext', true)
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('Denied')) },
    })
    const { view, toasts } = openReminder()
    await view.get('.input-group button').trigger('click')
    await flushPromises()
    const input = view.get<HTMLInputElement>('input').element
    expect(toasts.items.at(-1)?.variant).toBe('danger')
    expect(document.activeElement).toBe(input)
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(input.value.length)
    expect(view.find('aside').exists()).toBe(true)
  })

  it('separates confirmation by role and keeps working when storage is unavailable', async () => {
    localStorage.setItem('kado:access-saved:organizer:one', 'yes')
    const { view } = openReminder(false)
    expect(view.find('aside').exists()).toBe(true)
    const unavailable = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Blocked')
    })
    await view.get('.access-reminder-confirm').trigger('click')
    expect(view.find('aside').exists()).toBe(false)
    unavailable.mockRestore()
    view.unmount()
    const { view: reopened } = openReminder(false)
    expect(reopened.find('aside').exists()).toBe(true)
    await reopened.setProps({ organizer: true })
    expect(reopened.find('aside').exists()).toBe(false)
  })
})
