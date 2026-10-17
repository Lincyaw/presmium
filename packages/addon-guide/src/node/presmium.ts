/**
 * Guidance cues as MyST directives (P-30 to P-32):
 *
 *   :::{cursor}              one waypoint per line, `[move|hover|click] <selector>`;
 *   #query                   waypoint k is the block's step k
 *   click #run
 *   :::
 *
 *   :::{spotlight} #output   lit while its block's steps last (`:span:`, default 0),
 *   :title: Results          the body is the popover text
 *   The results show here.
 *   :::
 *
 *   :::{hint} #help          the same for a pulsing hint
 *   :::
 *
 * Cue steps count from the block (docs/ir.md 2.4): both renderers give the
 * component its block's `at` as step scope.
 */
import { createRequire } from 'node:module'
import { deckLocale } from '@presmium/kernel'
import type { ComponentNode, DirectiveSpec, MdastNode, PresmiumNodePlugin } from '@presmium/kernel'
import { CUE_MESSAGES, GUIDE_ID, parseCursorPath, planCursorPath } from '../domain/index.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

function component(name: string, props: Record<string, unknown>, fallback: MdastNode): ComponentNode {
  const defined = Object.fromEntries(Object.entries(props).filter(([, value]) => value !== undefined))
  return { type: 'component', plugin: GUIDE_ID, name, props: defined, fallback }
}

/**
 * A cue's popover as static content, for renderers that cannot show the cue,
 * in the deck's language (`lang`); empty without a popover.
 */
function popover(lang: string | undefined, title?: string, text?: string): MdastNode {
  const children: MdastNode[] = []
  if (title) children.push({ type: 'strong', children: [{ type: 'text', value: title }] })
  if (text) children.push({ type: 'text', value: title ? `${CUE_MESSAGES[deckLocale(lang)].separator}${text}` : text })
  return { type: 'root', children: children.length > 0 ? [{ type: 'paragraph', children }] : [] }
}

/** A cursor draws over the content (`layer: 'overlay'`): it has no place of its own, and nothing to show without running. */
const cursor: DirectiveSpec = {
  name: 'cursor',
  body: true,
  toIR(input, ctx) {
    const path = planCursorPath(parseCursorPath(input.body))
    if (path.length === 0) ctx.report({ checkId: GUIDE_ID, severity: 'error', message: '{cursor} needs at least one waypoint, e.g. `click #run`' })
    return { node: { ...component('PmCursor', { path }, popover(ctx.lang)), layer: 'overlay' }, span: path.at(-1)?.at ?? 0 }
  },
}

function cue(name: string, tag: string): DirectiveSpec {
  return {
    name,
    arg: true,
    body: true,
    options: { title: 'string', span: 'number' },
    toIR(input, ctx) {
      if (!input.arg) ctx.report({ checkId: GUIDE_ID, severity: 'error', message: `{${name}} needs the CSS selector of its target, e.g. {${name}} #run` })
      const span = typeof input.options.span === 'number' && Number.isInteger(input.options.span) && input.options.span > 0 ? input.options.span : 0
      const title = typeof input.options.title === 'string' && input.options.title ? input.options.title : undefined
      const text = input.body.trim() || undefined
      return { node: component(tag, { target: input.arg ?? '', until: span + 1, title, text }, popover(ctx.lang, title, text)), span }
    },
  }
}

const plugin: PresmiumNodePlugin = {
  id: GUIDE_ID,
  version,
  kernel: '^0.1.0',
  directives: [cursor, cue('spotlight', 'PmSpotlight'), cue('hint', 'PmHint')],
}

export default plugin
