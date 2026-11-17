import { watchEffect } from 'vue'

/** Each routed view owns its title, including while its data is loading. */
export function usePageTitle(parts: () => (string | null | undefined)[]) {
  watchEffect(() => {
    document.title = [
      ...parts()
        .map((part) => part?.trim())
        .filter(Boolean),
      'Kado',
    ].join(' · ')
  })
}
