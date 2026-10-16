/**
 * Semantic operations and lecture tracks (P-130; docs/architecture.md 4.9,
 * docs/ir.md 9.2): what a viewer did, by section, block and anchor, so it
 * can be recorded and replayed. The host's `OPERATIONS` reports and replays them.
 */

/** One operation, by section, block and anchor (vocabulary in docs/ir.md 9.2). */
export interface Operation {
  /** A built-in type (`go`, `point`, ...) or one starting with a plugin id. */
  type: string
  data: Record<string, unknown>
}

/** An event of a lecture track: `[ms since the lecture started, type, data]`. */
export type TrackEvent = [t: number, type: string, data: Record<string, unknown>]

/** `at` in event data: [utterance id, character offset]. */
export type UtteranceAnchor = [utterance: string, offset: number]
