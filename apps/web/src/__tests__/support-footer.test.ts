import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import SupportFooter from '../components/SupportFooter.vue'
import { i18n, setLocale, SUPPORT_LOCALES } from '../i18n'

let wrapper: VueWrapper | undefined
beforeEach(async () => {
  vi.stubEnv('VITE_DONATION_URL', '')
  vi.stubEnv('VITE_CONTACT_EMAIL', '')
  await setLocale('fr-CA')
})
afterEach(() => {
  wrapper?.unmount()
  vi.unstubAllEnvs()
})
function render(home = false) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/conditions-utilisation', name: 'terms', component: { template: '<div />' } },
      { path: '/confidentialite', name: 'privacy', component: { template: '<div />' } },
      { path: '/', component: { template: '<div />' } },
    ],
  })
  wrapper = mount(SupportFooter, { props: { home }, global: { plugins: [i18n, router] } })
  return wrapper
}

it('shows a contact link without requiring a donation link and translates it', async () => {
  vi.stubEnv('VITE_CONTACT_EMAIL', ' help+kado@example.com ')
  const view = render()
  expect(view.findAll('a')).toHaveLength(3)
  expect(view.get('a').attributes('href')).toBe('mailto:help+kado@example.com')
  for (const locale of SUPPORT_LOCALES) {
    await setLocale(locale)
    expect(view.get('a').text()).toBe(i18n.global.t('home.contact'))
  }
})

it.each(['', 'not-an-email', 'mailto:help@example.com', 'help@example.com?bcc=other@example.com'])(
  'hides an empty or invalid contact (%s)',
  (contact) => {
    vi.stubEnv('VITE_CONTACT_EMAIL', contact)
    expect(render().find('a[href^="mailto:"]').exists()).toBe(false)
    expect(wrapper!.findAll('nav a')).toHaveLength(2)
  },
)

it('keeps donation and contact independent', () => {
  vi.stubEnv('VITE_DONATION_URL', 'https://example.com/donate')
  vi.stubEnv('VITE_CONTACT_EMAIL', 'help@example.com')
  expect(
    render()
      .findAll('a')
      .map((a) => a.attributes('href')),
  ).toEqual([
    'https://example.com/donate',
    'mailto:help@example.com',
    '/conditions-utilisation',
    '/confidentialite',
  ])
})

it.each([true, false])(
  'always offers translated legal links in the footer (home=%s)',
  async (home) => {
    const view = render(home)
    for (const locale of SUPPORT_LOCALES) {
      await setLocale(locale)
      expect(view.get('nav').attributes('aria-label')).toBe(i18n.global.t('legal.navigation'))
      expect(view.get('a[href="/conditions-utilisation"]').text()).toBe(
        i18n.global.t('legal.terms'),
      )
      expect(view.get('a[href="/confidentialite"]').text()).toBe(i18n.global.t('legal.privacy'))
    }
  },
)
