import { load } from './load.mjs'

const row = await load('turns/index.ts')

export const name = row.name
export const inject = row.inject
export const apply = row.apply
