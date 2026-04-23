/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string
  readonly VITE_DONATION_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module 'bootstrap'
