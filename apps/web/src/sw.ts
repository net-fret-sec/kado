/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  matchPrecache,
  precacheAndRoute,
} from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { NetworkFirst } from 'workbox-strategies'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>
}

self.skipWaiting()
clientsClaim()
const home = new NetworkFirst({
  cacheName: 'kado-home-v1',
  networkTimeoutSeconds: 3,
  plugins: [
    {
      // Workbox ignores fetchOptions for navigation: clone explicitly to revalidate
      // even an HTML response cached by an older release without Cache-Control.
      requestWillFetch: async ({ request }) => new Request(request, { cache: 'no-cache' }),
      cacheKeyWillBeUsed: async () => new URL('/', self.location.origin).href,
      // Use the shell matching this worker's precached assets, including at timeout.
      cachedResponseWillBeUsed: async ({ cachedResponse }) =>
        (await matchPrecache('/index.html')) ?? cachedResponse,
      fetchDidSucceed: async ({ response }) => {
        if (response.status >= 500) throw new Error('Home unavailable')
        return response
      },
      // Never cache errors; serve the precached shell on a first offline navigation.
      cacheWillUpdate: async ({ response }) => (response.status === 200 ? response : null),
      handlerDidError: async () => (await matchPrecache('/index.html')) ?? Response.error(),
    },
  ],
})
// Ordering matters: precache also matches / and must not intercept navigation.
registerRoute(new NavigationRoute(home, { allowlist: [/^\/(?:index\.html)?(?:\?.*)?$/] }))
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/api(?:\/|$)/, /^\/health(?:\/|$)/],
  }),
)
