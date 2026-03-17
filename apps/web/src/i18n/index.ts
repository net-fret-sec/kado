import { createI18n } from 'vue-i18n'

export const SUPPORT_LOCALES = ['fr-CA', 'en-CA'] as const
export type AppLocale = (typeof SUPPORT_LOCALES)[number]

type MessageSchema = Record<string, unknown>

const defaultLocale: AppLocale = 'fr-CA'

const localeModules = import.meta.glob('./locales/*.json')

export const i18n = createI18n({
  legacy: false,
  locale: defaultLocale,
  fallbackLocale: defaultLocale,
  messages: {},
})

function isSupportedLocale(value: string): value is AppLocale {
  return SUPPORT_LOCALES.includes(value as AppLocale)
}

export function getDefaultLocale(): AppLocale {
  return defaultLocale
}

export function getBrowserLocale(): AppLocale {
  const locale = navigator.language

  if (locale.startsWith('fr')) return 'fr-CA'
  if (locale.startsWith('en')) return 'en-CA'

  return defaultLocale
}

export function getStoredLocale(): AppLocale | null {
  const stored = localStorage.getItem('locale')

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
  localStorage.setItem('locale', locale)
  document.documentElement.lang = locale
}

export async function setupI18n(): Promise<void> {
  await setLocale(getStartingLocale())
}
