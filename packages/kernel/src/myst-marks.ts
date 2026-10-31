import type { MdastNode } from './ir.ts'

// What a viewer reads from MyST nodes as they are, apart from their lowering (`lower-myst.ts`), which rewrites HTML.

/** Whether a MyST node has the class `button`, which renders a link or span as a button. */
export function isButton(node: MdastNode): boolean {
  return typeof node.class === 'string' && node.class.split(/\s+/).includes('button')
}

/** The mark a role without content shows: its name and value. */
export function roleMark(node: MdastNode): string {
  const options = typeof node.options === 'object' && node.options !== null ? node.options as Record<string, unknown> : {}
  const value = typeof options.value === 'string' ? options.value.trim() : ''
  return `〔${String(node.name ?? '')}${value ? ` ${value}` : ''}〕`
}
