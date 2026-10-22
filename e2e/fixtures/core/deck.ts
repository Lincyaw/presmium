// The fixture deck of e2e/core.spec.ts and e2e/web.spec.ts (./deck), built by `buildFixture` with the
// @lincyaw/host its test plugin imports and served as one site: the web form under /web/ and the
// slides under /slides/ (the bases the deck sets), so each form's default link to the other works.
import { buildFixture } from '../deck.ts'
import type { FixtureDeck } from '../deck.ts'

export type { FixtureDeck }

/** Builds and serves the fixture deck; `edit` may change the copy first. */
export function fixtureDeck(edit?: (dir: string) => void): Promise<FixtureDeck> {
  return buildFixture('core/deck', { with: ['host/plugin', 'host/services'], link: { '@lincyaw/host': 'packages/host' }, bases: true, edit })
}
