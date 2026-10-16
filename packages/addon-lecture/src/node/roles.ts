/**
 * The inline roles of narration (docs/ir.md 2.8, 2.9):
 *
 *   {cue to=code-1 lines=3-5}`spot`   a cue: what the lecture does when it says the word after it;
 *                                     no content shown (a mark `〔cue spot〕` in the presenter's notes)
 *   {say alias="B P E"}`BPE`          shows `BPE`, the lecture says "B P E"
 *
 * A cue's command is read when the role is compiled (an unknown one is a
 * warning there); its target, by `presmium check` (`presmium.lecture`).
 */
import type { RoleSpec } from '@presmium/kernel'
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
