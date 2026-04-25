import { computed } from 'vue'

import { useI18n } from 'vue-i18n'

export const SUPPORTED_THEMES = ['a', 'b', 'c', 'd', 'e', 'f', 'g'] as const
export type AppTheme = (typeof SUPPORTED_THEMES)[number]

const defaultTheme: AppTheme = 'a'

function isSupportedTheme(value: string): value is AppTheme {
  return SUPPORTED_THEMES.includes(value as AppTheme)
}

function getDocumentTheme(): AppTheme {
  const html = document.documentElement
  const fromTheme = html.dataset.theme
  const fromFontTest = html.dataset.fontTest

  if (fromTheme && isSupportedTheme(fromTheme)) {
    return fromTheme
  }

  if (fromFontTest && isSupportedTheme(fromFontTest)) {
    return fromFontTest
  }

  return defaultTheme
}

export function setTheme(theme: AppTheme): void {
  const html = document.documentElement

  html.dataset.theme = theme
  html.dataset.fontTest = theme
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
