import { createElement as h } from 'react'
import type { HTMLAttributes } from 'react'

export interface CaptionProps extends HTMLAttributes<HTMLElement> {
  label: string
  lines: readonly string[]
  hint?: string
}

/** Read-only caption text; its caller owns the source and playback position. */
export function PmCaption({ label, lines, hint, className, ...props }: CaptionProps) {
  return h('section', { ...props, className: ['pm-ui-caption', className].filter(Boolean).join(' '), 'aria-label': label, 'aria-live': 'polite', 'aria-atomic': true },
    hint ? h('p', { className: 'pm-ui-caption__hint' }, hint) : null,
    lines.map((text, index) => h('p', { key: index, className: 'pm-ui-caption__line' }, text)))
}
