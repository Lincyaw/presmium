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
 * Cue steps count from the block (docs/ir.md 2.4), as the web form's host
 * counts them; the slides extension shifts them to the steps of the slide.
 */
import type { ComponentNode, DirectiveSpec, MdastNode, PresmiumNodePlugin } from '@presmium/kernel'
import { GUIDE_ID, parseCursorPath, planCursorPath, shiftCue } from '../domain/index.ts'
import type { PlannedWaypoint } from '../domain/index.ts'
import { componentTag } from './tag.ts'

function component(name: string, props: Record<string, unknown>, fallback: MdastNode): ComponentNode {
  const defined = Object.fromEntries(Object.entries(props).filter(([, value]) => value !== undefined))
  return { type: 'component', plugin: GUIDE_ID, name, props: defined, fallback }
}

/** A cue's popover as static content, for renderers that cannot show the cue; empty without a popover. */
function popover(title?: string, text?: string): MdastNode {
  const children: MdastNode[] = []
  if (title) children.push({ type: 'strong', children: [{ type: 'text', value: title }] })
  if (text) children.push({ type: 'text', value: title ? `：${text}` : text })
  return { type: 'root', children: children.length > 0 ? [{ type: 'paragraph', children }] : [] }
}

const cursor: DirectiveSpec = {
  name: 'cursor',
  body: true,
  toIR(input, ctx) {
    const path = planCursorPath(parseCursorPath(input.body))
    if (path.length === 0) ctx.report({ checkId: GUIDE_ID, severity: 'error', message: '{cursor} needs at least one waypoint, e.g. `click #run`' })
    return { node: component('PmCursor', { path }, popover()), span: path.at(-1)?.at ?? 0 }
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
      return { node: component(tag, { target: input.arg ?? '', until: span + 1, title, text }, popover(title, text)), span }
    },
  }
}

const plugin: PresmiumNodePlugin = {
  id: GUIDE_ID,
  directives: [cursor, cue('spotlight', 'PmSpotlight'), cue('hint', 'PmHint')],
  rendererExtensions: {
    // Slidev counts the clicks of a whole slide.
    slides: {
      components: {
        PmCursor: (node, block) => componentTag('PmCursor', {
          ...node.props,
          path: (node.props.path as PlannedWaypoint[]).map(point => ({ ...point, at: point.at + block.at })),
        }),
        PmSpotlight: (node, block) => componentTag('PmSpotlight', shiftCue(node.props, block.at)),
        PmHint: (node, block) => componentTag('PmHint', shiftCue(node.props, block.at)),
      },
    },
  },
}

export default plugin
