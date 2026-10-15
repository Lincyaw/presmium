// `import.meta.env` as Vite declares it (both Slidev and VitePress build on Vite);
// kept identical so it merges with `vite/client` types where those are loaded.
interface ImportMetaEnv {
  DEV: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
