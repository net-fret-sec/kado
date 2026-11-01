import type { Router } from 'vue-router'

const pages: Record<string, string> = {
  home: 'home',
  'exchange-detail': 'organizer',
  'participant-self': 'participant',
}

export function registerPageViews(router: Router) {
  return router.afterEach((to, from, failure) => {
    if (failure || (from.matched.length > 0 && to.fullPath === from.fullPath)) return
    const page = typeof to.name === 'string' ? pages[to.name] : undefined
    if (
      !page ||
      navigator.doNotTrack === '1' ||
      (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl
    )
      return
    // No access token, cookies, URL, referrer, local storage or retry queue.
    // A failed count must never affect navigation, including offline PWA use.
    void fetch('/api/page-views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page }),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      mode: 'same-origin',
      keepalive: true,
    }).catch(() => {})
  })
}
