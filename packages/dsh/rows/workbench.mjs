import { ensureClient } from '../build/ensure.mjs'
import { load } from './load.mjs'

await ensureClient()
const row = await load('workbench.ts')

export const name = row.name
export const inject = row.inject
export const apply = row.apply
