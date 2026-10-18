/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_ORIGIN?: string
  readonly VITE_PLAY_ORIGIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
