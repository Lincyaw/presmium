import { DOCUMENT_VOICE_CLONE_SCHEMA } from '@lincyaw/kernel'
import type { DocumentVoiceCloneRequest } from '@lincyaw/kernel'

/** Private host RPC: an old server must fail with unknown-method, never execute ordinary training. */
export const CLONE_PREPARATION_METHOD = 'presmium/clonePreparation'
export type ClonePreparationRequest = { document?: string } & (
  | { phase: 'prepare', request: DocumentVoiceCloneRequest }
  | { phase: 'execute', prepared: string, request: DocumentVoiceCloneRequest }
  | { phase: 'release', prepared: string }
)
export const CLONE_PREPARATION_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: { document: { type: 'string', maxLength: 200 }, phase: { enum: ['prepare', 'execute', 'release'] },
    prepared: { type: 'string', pattern: '^[a-f0-9]{64}$' }, request: DOCUMENT_VOICE_CLONE_SCHEMA },
  required: ['phase'],
  oneOf: [
    { properties: { phase: { const: 'prepare' } }, required: ['request'], not: { required: ['prepared'] } },
    { properties: { phase: { const: 'execute' } }, required: ['prepared', 'request'] },
    { properties: { phase: { const: 'release' } }, required: ['prepared'], not: { required: ['request'] } },
  ],
} as const
