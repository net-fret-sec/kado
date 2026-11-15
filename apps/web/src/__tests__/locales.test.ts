import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import LanguageSwitcher from '../components/LanguageSwitcher.vue'
import ExchangeDetails from '../components/ExchangeDetails.vue'
import WishlistEditor from '../components/WishlistEditor.vue'
import ConflictReview from '../components/ConflictReview.vue'
import {
  SUPPORT_LOCALES,
  getBrowserLocale,
  getStartingLocale,
  getStoredLocale,
  i18n,
  setLocale,
} from '../i18n'

beforeEach(async () => {
  localStorage.clear()
  await setLocale('fr-CA')
  localStorage.clear()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Language selection', () => {
  it.each([
    ['fr-FR', 'fr-CA'],
    ['en-US', 'en-CA'],
    ['es-MX', 'es'],
    ['es-419', 'es'],
    ['it-CH', 'fr-CA'],
    ['ru-RU', 'fr-CA'],
    ['de-AT', 'fr-CA'],
    ['de-CH', 'fr-CA'],
    ['ja-JP', 'fr-CA'],
  ])('recognizes %s as %s', (browser, expected) => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue([browser])
    expect(getBrowserLocale()).toBe(expected)
  })

  it('uses the next supported browser preference and gives the saved choice priority', async () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['ja-JP', 'de-DE', 'es-MX', 'en-US'])
    expect(getStartingLocale()).toBe('es')
    await setLocale('en-CA')
    expect(getStartingLocale()).toBe('en-CA')
    localStorage.setItem('locale', 'unknown')
    expect(getStoredLocale()).toBeNull()
    expect(getStartingLocale()).toBe('es')
  })

  it.each(['it', 'ru', 'de'])('falls back safely from a saved %s preference', async (removed) => {
    localStorage.setItem('locale', removed)
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['de-DE', 'es-MX', 'en-US'])
    expect(getStoredLocale()).toBeNull()
    expect(getStartingLocale()).toBe('es')
    await setLocale(getStartingLocale())
    expect(getStoredLocale()).toBe('es')
    expect(document.documentElement.lang).toBe('es')
    localStorage.setItem('locale', removed)
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['ru-RU', 'it-IT'])
    expect(getStartingLocale()).toBe('fr-CA')
  })

  it('offers only the three supported languages by their native names and updates the document and storage', async () => {
    const wrapper = mount(LanguageSwitcher, { global: { plugins: [i18n] } })
    try {
      expect(wrapper.findAll('option').map((option) => option.text())).toEqual([
        'Français',
        'English',
        'Español',
      ])
      for (const locale of SUPPORT_LOCALES) {
        await wrapper.get('select').setValue(locale)
        await vi.waitFor(() => expect(i18n.global.locale.value).toBe(locale))
        await flushPromises()
        expect(document.documentElement.lang).toBe(locale)
        expect(getStoredLocale()).toBe(locale)
        expect(wrapper.get('label').text()).toBe(i18n.global.t('actions.changeLanguage'))
      }
    } finally {
      wrapper.unmount()
    }
  })
})

it('joins excluded participants naturally in French and Spanish', async () => {
  const wrapper = mount(ExchangeDetails, {
    props: {
      exchange: { id: 'e', name: 'Test', isDrawn: false, isArchived: false },
      exclusions: ['Blair', 'Casey'].map((name) => ({
        giverParticipantId: 'a',
        giverName: 'Alex',
        receiverParticipantId: name,
        receiverName: name,
      })),
    },
    global: { plugins: [i18n] },
  })
  try {
    for (const [locale, joined] of [
      ['es', 'Blair y Casey'],
      ['fr-CA', 'Blair et Casey'],
    ] as const) {
      await setLocale(locale)
      await flushPromises()
      expect(wrapper.text()).toContain(joined)
      expect(wrapper.text()).not.toContain('Blair and Casey')
    }
  } finally {
    wrapper.unmount()
  }
})

it('formats image limits without unnecessary decimals and removes reorder help when locked', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            images: {
              sourceBytes: 5 * 1048576,
              pixels: 24000000,
              dimension: 1600,
              outputBytes: 512000,
              formats: ['image/jpeg', 'image/png', 'image/webp'],
            },
          }),
        ),
    ),
  )
  const wrapper = mount(WishlistEditor, {
    props: { modelValue: [{ _clientId: 'one', title: 'Gift' }] },
    global: { plugins: [i18n] },
  })
  try {
    await flushPromises()
    for (const locale of SUPPORT_LOCALES) {
      await setLocale(locale)
      await flushPromises()
      const help = wrapper.get('p[id$="-image-help"]').text()
      expect(help).toContain(locale === 'fr-CA' ? '5 Mio' : '5 MiB')
      expect(help).not.toMatch(/5[.,]0/)
      expect(wrapper.find('.drag-handle').exists()).toBe(true)
      expect(wrapper.find('[id^="reorder-"]').exists()).toBe(true)
      await wrapper.setProps({ locked: true })
      expect(wrapper.find('.drag-handle').exists()).toBe(false)
      expect(wrapper.find('[id^="reorder-"]').exists()).toBe(false)
      expect(wrapper.text()).not.toContain(i18n.global.t('review.reorderHelp'))
      await wrapper.setProps({ locked: false })
    }
  } finally {
    wrapper.unmount()
  }
})

it('uses an exchange title rather than a personal name in conflict summaries', async () => {
  await setLocale('es')
  const wrapper = mount(ConflictReview, {
    props: {
      fields: [],
      choices: {},
      ready: false,
      current: { name: 'Test' },
      fieldLabelKeys: { name: 'fields.exchangeName' },
    },
    global: { plugins: [i18n] },
  })
  try {
    expect(wrapper.get('dt').text()).toBe('Nombre del intercambio')
    await wrapper.setProps({ fieldLabelKeys: undefined })
    expect(wrapper.get('dt').text()).toBe('Nombre')
  } finally {
    wrapper.unmount()
  }
})
