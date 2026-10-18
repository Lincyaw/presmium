import { load } from './load.mjs'

const row = await load('tools.ts')

export const name = row.name
export const inject = row.inject
export const apply = row.apply
