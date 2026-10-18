// The presmium-policy row: src/node/policy.ts (docs/design-dsh.md 6.2).
import { load } from './load.mjs'

const row = await load('policy.ts')

export const name = row.name
export const inject = row.inject
export const apply = row.apply
