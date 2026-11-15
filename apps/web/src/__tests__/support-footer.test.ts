import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
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
function render() {
  wrapper = mount(SupportFooter, { global: { plugins: [i18n] } })
  return wrapper
}

it('shows a contact link without requiring a donation link and translates it', async () => {
  vi.stubEnv('VITE_CONTACT_EMAIL', ' help+kado@example.com ')
  const view = render()
  expect(view.findAll('a')).toHaveLength(1)
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
    expect(render().find('footer').exists()).toBe(false)
  },
)

it('keeps donation and contact independent', () => {
  vi.stubEnv('VITE_DONATION_URL', 'https://example.com/donate')
  vi.stubEnv('VITE_CONTACT_EMAIL', 'help@example.com')
  expect(
    render()
      .findAll('a')
      .map((a) => a.attributes('href')),
  ).toEqual(['https://example.com/donate', 'mailto:help@example.com'])
})
