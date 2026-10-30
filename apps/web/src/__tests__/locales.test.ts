import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import LanguageSwitcher from '../components/LanguageSwitcher.vue'
import ExchangeDetails from '../components/ExchangeDetails.vue'
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
afterEach(() => vi.restoreAllMocks())

describe('Language selection', () => {
  it.each([
    ['fr-FR', 'fr-CA'],
    ['en-US', 'en-CA'],
    ['es-MX', 'es'],
    ['es-419', 'es'],
    ['it-CH', 'it'],
    ['ru-RU', 'ru'],
    ['de-AT', 'de'],
    ['de-CH', 'de'],
    ['ja-JP', 'fr-CA'],
  ])('recognizes %s as %s', (browser, expected) => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue([browser])
    expect(getBrowserLocale()).toBe(expected)
  })

  it('uses the next supported browser preference and gives the saved choice priority', async () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['ja-JP', 'de-DE', 'it-IT'])
    expect(getStartingLocale()).toBe('de')
    await setLocale('ru')
    expect(getStartingLocale()).toBe('ru')
    localStorage.setItem('locale', 'unknown')
    expect(getStoredLocale()).toBeNull()
    expect(getStartingLocale()).toBe('de')
  })

  it('offers all six languages by their native names and updates the document and storage', async () => {
    const wrapper = mount(LanguageSwitcher, { global: { plugins: [i18n] } })
    try {
      expect(wrapper.findAll('option').map((option) => option.text())).toEqual([
        'Français',
        'English',
        'Español',
        'Italiano',
        'Русский',
        'Deutsch',
      ])
      for (const locale of SUPPORT_LOCALES) {
        await wrapper.get('select').setValue(locale)
        await vi.waitFor(() => expect(i18n.global.locale.value).toBe(locale))
        await flushPromises()
        expect(document.documentElement.lang).toBe(locale)
        expect(getStoredLocale()).toBe(locale)
        expect(wrapper.get('label').text()).toBe(i18n.global.t('actions.changeLanguage'))
      }
      await setLocale('ru')
      expect(i18n.global.t('exchangeDetail.wishlistSuggestions', { count: 22 }, 22)).toBe(
        '22 пожелания',
      )
    } finally {
      wrapper.unmount()
    }
  })
})

it('joins excluded participants naturally in each newly supported language', async () => {
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
      ['it', 'Blair e Casey'],
      ['ru', 'Blair и Casey'],
      ['de', 'Blair und Casey'],
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
