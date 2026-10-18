// The presmium-routes row: src/node/routes.ts (docs/design-dsh.md 6.2).
import { load } from './load.mjs'

const row = await load('routes.ts')

export const name = row.name
export const inject = row.inject
export const apply = row.apply
