interface ImportMetaEnv {
  BASE_URL: string
  DEV: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.py?raw' {
  const source: string
  export default source
}
