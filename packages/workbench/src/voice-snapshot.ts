import { voiceTarget } from '@lincyaw/kernel'
import type { CanonicalSource, IRDocument, VoiceScope, VoiceTarget } from '@lincyaw/kernel'
import type { DocumentVoiceScope } from './document-voices.ts'
import { readDocumentSnapshot } from './document-preview.ts'
import type { Workbench } from './workbench.ts'

export interface VoiceSnapshot {
  directory: string
  identity: string
  revision: string
  source: CanonicalSource
  target: VoiceTarget
  ir: IRDocument
}

export function voiceSnapshotCurrent(workbench: Workbench, snapshot: VoiceSnapshot): boolean {
  const state = workbench.getState(), source = state.authoring
  return state.document === snapshot.directory && source?.identity === snapshot.identity && source.version === snapshot.source.version && source.fingerprint === snapshot.source.fingerprint
    && source.content?.id === snapshot.source.documentId && !source.loading && !source.dirty && !source.saving && !source.composing && !source.restored && !source.error
}

function targetFor(ir: IRDocument, stepId: string): VoiceTarget {
  const section = ir.sections.find(page => page.stepIds?.includes(stepId))
  const index = section?.stepIds?.indexOf(stepId) ?? -1
  if (!section || index < 0) throw new Error('voice-step-binding-stale')
  return voiceTarget(section, index)
}

/** Uses the acknowledged actor and full runtime step IDs; this request never builds or synthesizes audio. */
export async function prepareVoiceSnapshot(workbench: Workbench, stepId: string, signal: AbortSignal): Promise<VoiceSnapshot> {
  const initial = workbench.getState(), identity = initial.authoring?.identity, directory = initial.document
  if (!identity || directory === undefined) throw new Error('voice-context-changed')
  await workbench.pausePlayback()
  signal.throwIfAborted()
  await workbench.flushPendingEdits(signal)
  const current = workbench.getState(), source = current.authoring
  if (current.document !== directory || source?.identity !== identity || !source.version || !source.fingerprint || !source.content?.steps[stepId]) throw new Error('voice-context-changed')
  const ir = await readDocumentSnapshot(workbench.client, { directory, version: source.version, fingerprint: source.fingerprint }, signal)
  signal.throwIfAborted()
  if (!ir.doc.source) throw new Error('voice-source-pending')
  const snapshot: VoiceSnapshot = { directory, identity, revision: ir.revision, source: ir.doc.source, target: targetFor(ir.doc, stepId), ir: ir.doc }
  if (!voiceSnapshotCurrent(workbench, snapshot)) throw new Error('voice-context-changed')
  return snapshot
}

export function runtimeVoiceScope(snapshot: VoiceSnapshot, scope: DocumentVoiceScope): VoiceScope {
  if (scope.kind === 'document') return { kind: 'document' }
  if (scope.kind === 'page') {
    if (!snapshot.ir.sections.some(page => page.id === scope.sectionId)) throw new Error('voice-target-changed')
    return { kind: 'page', section: scope.sectionId }
  }
  if (scope.kind === 'step') return { kind: 'step', target: targetFor(snapshot.ir, scope.stepId) }
  if (!scope.stepIds.length) throw new Error('voice-script-empty')
  return { kind: 'steps', targets: [...new Set(scope.stepIds)].map(id => targetFor(snapshot.ir, id)) }
}
