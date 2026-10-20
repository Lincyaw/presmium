import type { RoleSpec } from '@lincyaw/kernel'
import { readCue } from '../domain/index.ts'

export const cueRole: RoleSpec = {
  name: 'cue',
  options: { to: 'string', lines: 'string', sel: 'string' },
  children(input, ctx) {
    const read = readCue(input.value)
    if ('problem' in read) ctx.report({ checkId: 'presmium.lecture', severity: 'warning', message: `{cue}\`${input.value}\`: ${read.problem}` })
    return []
  },
}

export const sayRole: RoleSpec = {
  name: 'say',
  options: { alias: 'string' },
  children(input, ctx) {
    if (typeof input.options.alias !== 'string' || !input.options.alias.trim()) {
      ctx.report({ checkId: 'presmium.lecture', severity: 'warning', message: `{say}\`${input.value}\` has no alias="…" to say; the lecture says what it shows` })
    }
    return [{ type: 'text', value: input.value }]
  },
}
