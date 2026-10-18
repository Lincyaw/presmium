// The presmium-turns row: src/node/turns/index.ts (docs/design-dsh.md 6.2).
import { load } from './load.mjs'

const row = await load('turns/index.ts')

export const name = row.name
export const inject = row.inject
export const apply = row.apply
