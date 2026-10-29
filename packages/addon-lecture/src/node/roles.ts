import type { RoleSpec } from '@lincyaw/kernel'
import { cueProblem, LECTURE_ID, parseCue } from '../domain/index.ts'

export const cueRole: RoleSpec = {
  name: 'cue',
  options: { to: 'string', lines: 'string', sel: 'string' },
  children(input, ctx) {
    const parsed = parseCue(input.value)
    if ('problem' in parsed) ctx.report({ checkId: LECTURE_ID, severity: 'warning', message: cueProblem(input.value, parsed.problem, ctx.lang) })
    return []
  },
}

export const sayRole: RoleSpec = {
  name: 'say',
  options: { alias: 'string' },
  children(input, ctx) {
    if (typeof input.options.alias !== 'string' || !input.options.alias.trim()) {
      ctx.report({ checkId: LECTURE_ID, severity: 'warning', message: `{say}\`${input.value}\` has no alias="…" to say; the lecture says what it shows` })
    }
    return [{ type: 'text', value: input.value }]
  },
}
