// `import.meta.env` as Vite declares it (Vite builds both forms), in the same shape as
// vite/client so the declarations merge when both are present.
interface ImportMetaEnv {
  BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
