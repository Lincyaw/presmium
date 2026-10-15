// The Vite features used by the browser adapter (Vite builds both forms). Declared
// in the same shape as vite/client so the declarations merge when both are present.
interface ImportMetaEnv {
  BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.py?raw' {
  const source: string
  export default source
}
