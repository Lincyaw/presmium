export interface Operation {
  type: string
  data: Record<string, unknown>
}

export type TrackEvent = [t: number, type: string, data: Record<string, unknown>]

export type UtteranceAnchor = [utterance: string, offset: number]
