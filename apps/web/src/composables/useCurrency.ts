import { i18n } from '@/i18n'
export const currencySymbol = import.meta.env.VITE_CURRENCY_SYMBOL?.trim() || '$'
export function formatMoney(amount: number) {
  return `${new Intl.NumberFormat(i18n.global.locale.value, { maximumFractionDigits: 2 }).format(amount)} ${currencySymbol}`
}
