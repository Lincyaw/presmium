/**
 * The `presmium-turns` row (docs/design-dsh.md 6.5): a session's turns, its
 * review and its commits. WP-96b declares the row and its entry; WP-96c
 * implements it (before the first write of a session, open the document's
 * review and hold its lock; a checkpoint after each tool call; accepting
 * commits).
 */
import type { DshContext } from '../dsh.ts'

export const name = 'presmium-turns'
export const inject = ['presmium']

export function apply(_ctx: DshContext): void {
  // WP-96c.
}
