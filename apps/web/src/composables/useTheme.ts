import { computed } from 'vue'

import { useI18n } from 'vue-i18n'

export const SUPPORTED_THEMES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'] as const
export type AppTheme = (typeof SUPPORTED_THEMES)[number]

const defaultTheme: AppTheme = 'a'

function isSupportedTheme(value: string): value is AppTheme {
  return SUPPORTED_THEMES.includes(value as AppTheme)
}

function getDocumentTheme(): AppTheme {
  const html = document.documentElement
  const fromFontTheme = html.dataset.fontTheme
  const fromFontTest = html.dataset.fontTest
  const fromTheme = html.dataset.theme

  if (fromFontTheme && isSupportedTheme(fromFontTheme)) {
    return fromFontTheme
  }

  if (fromFontTest && isSupportedTheme(fromFontTest)) {
    return fromFontTest
  }

  if (fromTheme && isSupportedTheme(fromTheme)) {
    return fromTheme
  }

  return defaultTheme
}

export function setTheme(theme: AppTheme): void {
  const html = document.documentElement
  html.dataset.fontTheme = theme
  // Legacy attrs can match old selectors and override active font theme by cascade order.
  delete html.dataset.theme
  delete html.dataset.fontTest
}

export function useTheme() {
  const { t } = useI18n()

  const currentTheme = computed<AppTheme>({
    get: () => getDocumentTheme(),
    set: (value) => {
      setTheme(value)
    },
  })

  return {
    t,
    currentTheme,
    supportedThemes: SUPPORTED_THEMES,
    setTheme,
  }
}
