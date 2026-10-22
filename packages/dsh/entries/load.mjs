// DeepSeek Harness imports each row of the bundle by its package export, as plain ESM: it has no loader for
// TypeScript. Each file of this directory is the entry of one row and loads the row's source, src/node/<row>.ts,
// through jiti.
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const jiti = createJiti(import.meta.url)

export function load(file) {
  return jiti.import(fileURLToPath(new URL(`../src/node/${file}`, import.meta.url)))
}
