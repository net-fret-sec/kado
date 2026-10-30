import { readStorage, writeStorage } from '@/composables/useStorage'
import { createI18n } from 'vue-i18n'
import { pluralRules } from './plurals'

export const SUPPORT_LOCALES = ['fr-CA', 'en-CA', 'es', 'it', 'ru', 'de'] as const
export type AppLocale = (typeof SUPPORT_LOCALES)[number]

type MessageSchema = Record<string, unknown>

const defaultLocale: AppLocale = 'fr-CA'

const localeModules = import.meta.glob('./locales/*.json')

export const i18n = createI18n({
  legacy: false,
  locale: defaultLocale,
  fallbackLocale: defaultLocale,
  messages: {},
  pluralRules,
})

function isSupportedLocale(value: string): value is AppLocale {
  return SUPPORT_LOCALES.includes(value as AppLocale)
}

export function getDefaultLocale(): AppLocale {
  return defaultLocale
}

export function getBrowserLocale(): AppLocale {
  const preferred = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const language of preferred) {
    const base = language.toLowerCase().split('-')[0]
    const match = SUPPORT_LOCALES.find((locale) => locale.split('-')[0] === base)
    if (match) return match
  }

  return defaultLocale
}

export function getStoredLocale(): AppLocale | null {
  const stored = readStorage('locale')

  if (stored && isSupportedLocale(stored)) {
    return stored
  }

  return null
}

export function getStartingLocale(): AppLocale {
  return getStoredLocale() ?? getBrowserLocale()
}

async function loadLocaleMessages(locale: AppLocale): Promise<MessageSchema> {
  const loader = localeModules[`./locales/${locale}.json`]

  if (!loader) {
    throw new Error(`Locale introuvable: ${locale}`)
  }

  const module = (await loader()) as { default: MessageSchema }
  return module.default
}

export async function setLocale(locale: AppLocale): Promise<void> {
  if (!i18n.global.availableLocales.includes(locale)) {
    const messages = await loadLocaleMessages(locale)
    i18n.global.setLocaleMessage(locale, messages)
  }

  i18n.global.locale.value = locale
  writeStorage('locale', locale)
  document.documentElement.lang = locale
}

export async function setupI18n(): Promise<void> {
  await setLocale(getStartingLocale())
}
