import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const jiti = createJiti(import.meta.url)

export function load(file) {
  return jiti.import(fileURLToPath(new URL(`../src/node/${file}`, import.meta.url)))
}
