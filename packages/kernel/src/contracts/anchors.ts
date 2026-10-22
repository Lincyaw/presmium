import type { Unsubscribe } from './plugin.ts'

export type AnchorString = `${string}:${string}`

export type ResolutionStatus = 'exact' | 'moved' | 'fuzzy' | 'lost'

export interface ResolvedLocation {
  file: string
  startLine: number
  endLine: number
  text: string
}

export interface Resolution {
  status: ResolutionStatus
  location?: ResolvedLocation
  fingerprint?: string
  candidates?: ResolvedLocation[]
  message?: string
}

export interface SourceReader {
  read(file: string, ref?: string): Promise<string | undefined>
}

export interface RecordedAnchor {
  fingerprint: string
  file: string
  startLine: number
}

export interface AnchorResolver {
  scheme: string
  resolve(anchor: AnchorString, src: SourceReader, recorded?: RecordedAnchor, ref?: string): Promise<Resolution>
}

export interface AnchorResolverRegistry {
  register(resolver: AnchorResolver): Unsubscribe
  resolve(anchor: AnchorString, src: SourceReader, recorded?: RecordedAnchor, ref?: string): Promise<Resolution>
  schemes(): string[]
}

export interface AnchorLockFile {
  version: 1
  anchors: Record<string, RecordedAnchor>
}
