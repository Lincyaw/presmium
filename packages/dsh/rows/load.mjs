// The rows' entries are plain ESM: DeepSeek Harness's runtime has no TypeScript loader, and Node does not
// strip the types of files under node_modules. Each entry loads its row's TypeScript source with jiti, as
// Presmium's own commands do (docs/design-dsh.md 6.1, K3).
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const jiti = createJiti(import.meta.url)

/** A row's module of `src/node`, by its path there. */
export function load(file) {
  return jiti.import(fileURLToPath(new URL(`../src/node/${file}`, import.meta.url)))
}
