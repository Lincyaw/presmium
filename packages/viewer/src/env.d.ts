// `import.meta.env` as Vite declares it, in the same shape as vite/client so the declarations merge:
// `SSR` is replaced statically, so code behind `if (import.meta.env.SSR)` leaves the other build.
interface ImportMetaEnv {
  SSR: boolean
}
