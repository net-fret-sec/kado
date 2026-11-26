import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import LegalView from '../views/LegalView.vue'
import { i18n, setLocale, SUPPORT_LOCALES } from '../i18n'
import type { LegalDocument } from '@kado/shared'

let wrapper: VueWrapper | undefined
const content = (locale = 'fr-CA'): LegalDocument => ({
  document: 'confidentialite',
  locale: locale as LegalDocument['locale'],
  title: `Privacy ${locale}`,
  status: 'draft',
  effectiveAt: null,
  updatedAt: '2026-11-26',
  html: `<h2>Section ${locale}</h2><p>Content ${locale}</p>`,
})
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
function open() {
  wrapper = mount(LegalView, {
    props: { document: 'confidentialite' },
    global: { plugins: [i18n] },
  })
  return wrapper
}
beforeEach(async () => {
  await setLocale('fr-CA')
})
afterEach(() => {
  wrapper?.unmount()
  vi.unstubAllGlobals()
})

it('loads each language without caching, formats dates and reloads on document changes', async () => {
  const fetch = vi.fn((url: string) =>
    Promise.resolve(json(content(new URL(url, 'http://localhost').searchParams.get('locale')!))),
  )
  vi.stubGlobal('fetch', fetch)
  const view = open()
  for (const locale of SUPPORT_LOCALES) {
    await setLocale(locale)
    await flushPromises()
    expect(view.get('h1').text()).toBe(`Privacy ${locale}`)
    expect(document.title).toBe(`Privacy ${locale} · Kado`)
    expect(view.get('.legal-body').attributes('lang')).toBe(locale)
    expect(view.findAll('time')).toHaveLength(1)
    expect(view.get('time').attributes('datetime')).toBe('2026-11-26')
    expect(view.get('time').text()).toBe(
      new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
        new Date('2026-11-26T12:00:00Z'),
      ),
    )
    expect(view.get('.alert').text()).toBe(i18n.global.t('legal.draft'))
    expect(fetch).toHaveBeenLastCalledWith(
      `/api/legal/confidentialite?locale=${locale}`,
      expect.objectContaining({ cache: 'no-store' }),
    )
  }
  await view.setProps({ document: 'conditions-utilisation' })
  await flushPromises()
  expect(fetch).toHaveBeenLastCalledWith(
    '/api/legal/conditions-utilisation?locale=es',
    expect.anything(),
  )
})

it('shows an error without old content, then retries and displays published dates', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(json(content()))
    .mockResolvedValueOnce(json({}, 503))
    .mockResolvedValueOnce(
      json({ ...content('en-CA'), status: 'published', effectiveAt: '2026-11-26' }),
    )
  vi.stubGlobal('fetch', fetch)
  const view = open()
  await flushPromises()
  expect(view.find('.legal-body').exists()).toBe(true)
  await setLocale('en-CA')
  await flushPromises()
  expect(view.find('.legal-body').exists()).toBe(false)
  expect(view.get('[role="alert"]').text()).toContain(i18n.global.t('legal.unavailable'))
  expect(view.get('h1').text()).toBe(i18n.global.t('legal.privacy'))
  await view.get('button').trigger('click')
  await flushPromises()
  expect(view.get('.legal-body').text()).toContain('Content en-CA')
  expect(view.find('.alert').exists()).toBe(false)
  expect(view.findAll('time')).toHaveLength(2)
})

it('identifies the reference language when a translation is missing', async () => {
  await setLocale('es')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(content('fr-CA'))))
  const view = open()
  await flushPromises()
  expect(view.get('.legal-body').attributes('lang')).toBe('fr-CA')
  expect(view.get('[role="status"]').text()).toBe(
    i18n.global.t('legal.fallback', { language: i18n.global.t('languages.fr') }),
  )
  expect(view.get('h1').text()).toBe('Privacy fr-CA')
})

it('ignores late responses after a language change and aborts on leaving the page', async () => {
  let resolveOld!: (response: Response) => void
  let resolveLeaving!: (response: Response) => void
  const signals: AbortSignal[] = []
  const fetch = vi.fn((_url: string, init: RequestInit) => {
    signals.push(init.signal as AbortSignal)
    if (signals.length === 1)
      return new Promise<Response>((resolve) => {
        resolveOld = resolve
      })
    if (signals.length === 3)
      return new Promise<Response>((resolve) => {
        resolveLeaving = resolve
      })
    return Promise.resolve(json(content('es')))
  })
  vi.stubGlobal('fetch', fetch)
  const view = open()
  await setLocale('es')
  await flushPromises()
  expect(signals[0]!.aborted).toBe(true)
  resolveOld(json(content()))
  await flushPromises()
  expect(view.get('h1').text()).toBe('Privacy es')
  await setLocale('fr-CA')
  await flushPromises()
  view.unmount()
  wrapper = undefined
  expect(signals[2]!.aborted).toBe(true)
  resolveLeaving(json(content()))
  await flushPromises()
})
