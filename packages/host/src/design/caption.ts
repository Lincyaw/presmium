import { createContext, createElement as h, useContext } from 'react'
import type { HTMLAttributes, ReactNode } from 'react'
import { createPortal } from 'react-dom'

const CaptionContainer = createContext<HTMLElement | null>(null)

/** The viewer supplies a stable caption surface on its scaled slide canvas. */
export function PmCaptionProvider({ container, children }: { container: HTMLElement | null, children?: ReactNode }) {
  return h(CaptionContainer.Provider, { value: container }, children)
}

export interface CaptionProps extends HTMLAttributes<HTMLElement> {
  label: string
  lines: readonly string[]
  hint?: string
  overlay?: boolean
}

/** Read-only caption text; its caller owns the source and playback position. */
export function PmCaption({ label, lines, hint, overlay = false, className, ...props }: CaptionProps) {
  const container = useContext(CaptionContainer)
  const caption = h('section', { ...props, className: ['pm-ui-caption', className].filter(Boolean).join(' '), 'data-overlay': overlay || undefined, 'aria-label': label, 'aria-live': 'polite', 'aria-atomic': true, tabIndex: overlay ? 0 : props.tabIndex },
    hint ? h('p', { className: 'pm-ui-caption__hint' }, hint) : null,
    lines.map((text, index) => h('p', { key: index, className: 'pm-ui-caption__line' }, text)))
  return overlay ? container && createPortal(caption, container) : caption
}
