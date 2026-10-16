/**
 * The AI-generated label of synthesized audio (N-08): the implicit metadata
 * of GB 45438-2025 (Annex E), `AIGC={…}` with these fields, which the speech
 * service writes into the audio of the synthesis cache and into its
 * `<key>.json` (docs/design-v0.7.md section 11 records where in each format).
 */

export interface AigcLabel {
  /** "1": AI-generated (the generating service's own label). */
  Label: '1'
  /** The generating service's provider (the engine's provider). */
  ContentProducer: string
  /** The content's number with the producer: the synthesis cache key. */
  ProduceID: string
  ReservedCode1: string
  /** Empty: set by a platform that spreads the content. */
  ContentPropagator: string
  PropagateID: string
  ReservedCode2: string
}

export function aigcLabel(producer: string, produceId: string): AigcLabel {
  return { Label: '1', ContentProducer: producer, ProduceID: produceId, ReservedCode1: '', ContentPropagator: '', PropagateID: '', ReservedCode2: '' }
}

/** The label as the metadata string: `AIGC={"Label":"1",…}`. */
export function aigcString(label: AigcLabel): string {
  return `AIGC=${JSON.stringify(label)}`
}
