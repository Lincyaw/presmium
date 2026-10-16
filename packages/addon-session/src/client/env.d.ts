// The Vite features used by the browser adapter (Vite builds both forms). Declared
// in the same shape as vite/client so the declarations merge when both are present.
interface ImportMetaEnv {
  BASE_URL: string
  /** True on a dev server, false in a build. */
  DEV: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent
  export default component
}
