import { load } from './load.mjs'

const row = await load('telemetry.ts')

export const name = row.name
export const inject = row.inject
export const apply = row.apply
