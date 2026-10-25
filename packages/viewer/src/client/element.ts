import { createElement, isValidElement } from 'react'
import type { ElementType, ReactElement, ReactNode } from 'react'
export function classNames(value: unknown): string | undefined {
  if (!value) return undefined
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(classNames).filter(Boolean).join(' ')
  if (typeof value === 'object') return Object.entries(value).filter(([, active]) => active).map(([key]) => key).join(' ')
  return undefined
}
/** Shared DOM attribute normalization for HAST and the viewer's generated elements. */
export function h(type: ElementType | any, attrs?: Record<string, any> | ReactNode | null, children?: ReactNode, ...rest: ReactNode[]): ReactElement {
  if (attrs !== null && attrs !== undefined && (typeof attrs !== 'object' || Array.isArray(attrs) || isValidElement(attrs))) return createElement(type, null, attrs as ReactNode, children, ...rest)
  const props = { ...attrs as Record<string, any> }
  if (props.class !== undefined) { props.className = classNames(props.class); delete props.class }
  if (props.innerHTML !== undefined) { props.dangerouslySetInnerHTML = { __html: props.innerHTML }; delete props.innerHTML }
  if (props.tabindex !== undefined) { props.tabIndex = props.tabindex; delete props.tabindex }
  if (props.contenteditable !== undefined) { props.contentEditable = props.contenteditable; delete props.contenteditable }
  return createElement(type, props, children, ...rest)
}
