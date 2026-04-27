import { computed } from 'vue'

import { useI18n } from 'vue-i18n'

export const SUPPORTED_PALETTE_THEMES = [
  'a',
  'b',
  'c',
  'd',
  'e',
  'f',
  'g',
  'h',
  'i',
  'j',
  'k',
  'l',
  'm',
  'n',
  'o',
  'p',
] as const
export type AppPaletteTheme = (typeof SUPPORTED_PALETTE_THEMES)[number]

const defaultPaletteTheme: AppPaletteTheme = 'a'

function isSupportedPaletteTheme(value: string): value is AppPaletteTheme {
  return SUPPORTED_PALETTE_THEMES.includes(value as AppPaletteTheme)
}

function getDocumentPaletteTheme(): AppPaletteTheme {
  const html = document.documentElement
  const fromPaletteTheme = html.dataset.paletteTheme
  const fromTheme = html.dataset.theme
  const fromFontTest = html.dataset.fontTest

  if (fromPaletteTheme && isSupportedPaletteTheme(fromPaletteTheme)) {
    return fromPaletteTheme
  }

  if (fromTheme && isSupportedPaletteTheme(fromTheme)) {
    return fromTheme
  }

  if (fromFontTest && isSupportedPaletteTheme(fromFontTest)) {
    return fromFontTest
  }

  return defaultPaletteTheme
}

export function setPaletteTheme(theme: AppPaletteTheme): void {
  const html = document.documentElement
  html.dataset.paletteTheme = theme
  // Legacy attrs can collide with dedicated palette/font selectors.
  delete html.dataset.theme
  delete html.dataset.fontTest
}

export function usePaletteTheme() {
  const { t } = useI18n()

  const currentPaletteTheme = computed<AppPaletteTheme>({
    get: () => getDocumentPaletteTheme(),
    set: (value) => {
      setPaletteTheme(value)
    },
  })

  return {
    t,
    currentPaletteTheme,
    supportedPaletteThemes: SUPPORTED_PALETTE_THEMES,
  }
}
