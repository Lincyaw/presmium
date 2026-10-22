import type { IRDocument } from '../ir.ts'
import type { AnchorLockFile, AnchorResolverRegistry, SourceReader } from './anchors.ts'
import type { ServiceToken } from './service.ts'

export type Severity = 'error' | 'warning' | 'info'

export interface Finding {
  checkId: string
  severity: Severity
  message: string
  source?: { file: string; line?: number }
  hint?: string
}

export interface CheckContext {
  deckDir: string
  workspaceRoot: string
  headmatter: Record<string, unknown>
  src: SourceReader
  resolvers: AnchorResolverRegistry
  lock: AnchorLockFile
  ir: IRDocument
  service?<T>(token: ServiceToken<T>): T | undefined
}

export interface Check {
  id: string
  run(ctx: CheckContext): Promise<Finding[]>
}
