// `import.meta.env` as Vite declares it; merges with `vite/client` types where those are loaded.
interface ImportMetaEnv {
  /** Set to '1' by presmium-diff for the `slidev export` it runs. */
  VITE_PRESMIUM_VISUAL_DIFF?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
