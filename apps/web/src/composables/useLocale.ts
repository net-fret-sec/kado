import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  SUPPORT_LOCALES,
  setLocale,
  type AppLocale,
} from '@/i18n'

export function useLocale() {
  const { locale, t } = useI18n()

  const currentLocale = computed<AppLocale>({
    get: () => locale.value as AppLocale,
    set: async (value) => {
      await setLocale(value)
    },
  })

  async function changeLocale(value: AppLocale) {
    await setLocale(value)
  }

  return {
    t,
    locale,
    currentLocale,
    supportedLocales: SUPPORT_LOCALES,
    changeLocale,
  }
}
