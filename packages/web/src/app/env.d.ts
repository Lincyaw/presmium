/// <reference types="vite/client" />
declare module 'virtual:presmium-app/registry' {
  /** The browser modules of each installed plugin package, as the viewer app was built with them. */
  export const packages: Record<string, {
    /** The package's own name. */
    name: string
    components: Record<string, () => Promise<unknown>>
    plugins: (() => Promise<unknown>)[]
    viewers: (() => Promise<unknown>)[]
    restartable: boolean
  }>
}
