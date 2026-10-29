import { useLayoutEffect } from 'react'
import { Menu } from '@mantine/core'
import { components } from '@blocknote/mantine'
import type { ComponentProps, FloatingUIOptions } from '@blocknote/react'
import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/react'

/** A length token in CSS pixels, for positioning code that only takes numbers. */
function tokenPixels(name: string, element: Element = document.documentElement): number {
  const value = getComputedStyle(element).getPropertyValue(name).trim(), number = Number.parseFloat(value)
  if (!Number.isFinite(number)) return 0
  return value.endsWith('rem') ? number * Number.parseFloat(getComputedStyle(document.documentElement).fontSize) : number
}

/** Popovers keep this distance from the screen edges. */
const edge = (element?: Element) => tokenPixels('--pm-space-2', element)

const BlockNoteMenuRoot = components.Generic.Menu.Root

/**
 * BlockNote's menus, with a margin to the screen edge when a menu is taller than the room on either side of its
 * button: it then keeps its border and shadow inside the screen and scrolls, rather than being cut by the edge.
 * Placement (flip and shift) stays BlockNote's, so menus that fit open where they always did.
 */
export function DocumentMenuRoot(props: ComponentProps['Generic']['Menu']['Root']) {
  // Submenus already slide along the screen edge beside their item.
  if (props.sub) return <BlockNoteMenuRoot {...props} />
  const { children, onOpenChange, position, portalElement, preventFocusOnOpen } = props
  return <Menu withinPortal={!!portalElement} portalProps={portalElement ? { target: portalElement } : undefined}
    // As in BlockNote: on touch screens the menu must not take focus from the text, or the keyboard closes.
    trapFocus={preventFocusOnOpen ? false : undefined} returnFocus={false} onChange={onOpenChange} position={position}
    middlewares={{ flip: true, shift: true, inline: false, size: { padding: edge() } }}>
    {children}
  </Menu>
}

// BlockNote's own gap between a link and its toolbar, kept so the toolbar does not move on wide screens.
const LINK_TOOLBAR_GAP = 10

/** The link toolbar also slides back inside the screen when its link ends near the right edge. */
export function linkToolbarFloating(): FloatingUIOptions {
  return { useFloatingOptions: { middleware: [offset(LINK_TOOLBAR_GAP), flip(), shift({ padding: edge() })] } }
}

// BlockNote's own gap between commented text and its floating card or new-comment form.
const COMMENT_GAP = 10

type FloatingMiddleware = NonNullable<NonNullable<FloatingUIOptions['useFloatingOptions']>['middleware']>[number]

/**
 * Positions against one line box of the commented text instead of the box around the whole range, so a card for a
 * long or wrapped comment opens at the line that was clicked. `line` gives that line in viewport coordinates.
 */
function commentLine(line: () => DOMRect | undefined): FloatingMiddleware {
  return {
    name: 'commentLine',
    async fn({ rects, elements, middlewareData }) {
      const target = middlewareData.commentLine?.applied ? undefined : line()
      if (!target) return { data: { applied: true } }
      // The reference rect is relative to the card's offset parent; move it by the line's offset from the whole range.
      const whole = elements.reference.getBoundingClientRect()
      const reference = { x: rects.reference.x + target.left - whole.left, y: rects.reference.y + target.top - whole.top, width: target.width, height: target.height }
      return { data: { applied: true }, reset: { rects: { reference, floating: rects.floating } } }
    },
  }
}

/**
 * Comment cards and the new-comment form keep BlockNote's place under the text (above when there is no room below)
 * and slide back inside the screen with the same margin as the other popovers, instead of touching its edge. With
 * `line`, the card follows that line of the text and starts where it starts.
 */
export function commentFloating(line?: () => DOMRect | undefined): NonNullable<FloatingUIOptions['useFloatingOptions']> {
  const padding = edge()
  return {
    ...line ? { placement: 'bottom-start' as const } : {},
    middleware: [...line ? [commentLine(line)] : [], offset(COMMENT_GAP), flip({ padding, flipAlignment: false }), shift({ padding })],
  }
}

/**
 * Keeps an inline source popup (BlockNote positions it under the left end of its formula) inside the screen:
 * it flips above the line near the bottom and slides left near the right edge.
 */
export function useInlineSourcePopupPlacement(source: () => HTMLElement | null, open: boolean): void {
  useLayoutEffect(() => {
    // The formula's own box is the reference, as for BlockNote's placement, so a popup with room keeps its place.
    const reference = source()?.closest<HTMLElement>('.bn-preview-with-source-popup'), popup = reference?.querySelector<HTMLElement>('.bn-source-block-popup')
    if (!open || !reference || !popup) return
    let current = true
    const place = () => {
      const padding = edge(popup)
      computePosition(reference, popup, { strategy: 'absolute', placement: 'bottom-start', middleware: [offset(tokenPixels('--pm-space-1', popup)), flip({ padding, flipAlignment: false }), shift({ padding })] })
        .then(({ x, y }) => {
          if (!current) return
          popup.style.setProperty('--pm-source-popup-x', `${x}px`)
          popup.style.setProperty('--pm-source-popup-y', `${y}px`)
        })
    }
    const stop = autoUpdate(reference, popup, place)
    return () => {
      current = false
      stop()
      popup.style.removeProperty('--pm-source-popup-x')
      popup.style.removeProperty('--pm-source-popup-y')
    }
  }, [open, source])
}
