import type { Narration, NarrationNode, TeachingDocument } from './contracts/document.ts'
import type { TranscriptionRevision } from './contracts/transcription.ts'
import type { TranscriptionAdoptionDraft, TranscriptionAdoptionPreview } from './contracts/transcription-adoption.ts'
import { fnv1a64 } from './fingerprint.ts'
import { validateDocument } from './document.ts'

const own = (table: object, key: string) => Object.hasOwn(table, key)
const shown = (nodes: NarrationNode[]) => nodes.map(node => node.type === 'text' ? node.text : node.type === 'pronunciation' ? node.display : '').join('')
const sameIds = (a: string[], b: string[]) => { const sorted = [...b].sort(); return a.length === b.length && [...a].sort().every((id, index) => id === sorted[index]) }
const atomKey = (index: number, node: NarrationNode) => `atom:${index}:${fnv1a64(JSON.stringify(node))}`

/** Builds one typed candidate from explicit author decisions, without I/O or writing the input document. */
export function prepareTranscriptionAdoption(document: TeachingDocument, candidate: TranscriptionRevision, draft: TranscriptionAdoptionDraft): TranscriptionAdoptionPreview & { content?: TeachingDocument } {
  const result: TranscriptionAdoptionPreview = { targets: [], conflicts: [], impact: { narrationIds: [], stepIds: [], sharedStepIds: [], forks: [], removedAtoms: [], removedCueTimings: [] } }
  const conflict = (code: string, target?: number, key?: string, stepIds?: string[]) => { result.conflicts.push({ code, ...target !== undefined ? { target } : {}, ...key ? { key } : {}, ...stepIds ? { stepIds } : {} }) }
  if (candidate.transcriptionId !== draft.candidate.id || candidate.revision !== draft.candidate.revision || candidate.source.documentId !== document.id || draft.source.documentId !== document.id) {
    conflict('candidate-document-changed'); return result
  }
  const output = structuredClone(document), changed = new Map<string, Narration>(), targets = new Set<string>(), removedCues = new Set<string>()
  const globalIds = new Set([document.id, ...(['sections', 'blocks', 'steps', 'narrations', 'assets', 'definitions'] as const).flatMap(name => Object.keys(document[name])), ...Object.values(document.narrations).flatMap(narration => narration.content.flatMap(node => node.type === 'cue' ? [node.id] : []))])
  const generate = (kind: string, target: string, extra = '') => `${kind}-${fnv1a64(JSON.stringify([document.id, draft.id, target, extra]))}`
  for (const [index, target] of draft.targets.entries()) {
    const step = own(document.steps, target.stepId) ? document.steps[target.stepId] : undefined
    const section = own(document.sections, target.sectionId) ? document.sections[target.sectionId] : undefined
    if (!step || !section || step.sectionId !== section.id || !section.stepOrder.includes(step.id)) { conflict('target-changed', index); continue }
    const address = JSON.stringify([step.id, target.narrationId ?? null])
    if (targets.has(address)) { conflict('target-repeated', index); continue }
    targets.add(address)
    const before = target.narrationId !== undefined && own(document.narrations, target.narrationId) ? document.narrations[target.narrationId] : undefined
    if (target.narrationId !== undefined ? !before || !step.narrationIds.includes(target.narrationId) : step.narrationIds.length !== 0) { conflict('narration-target-changed', index); continue }
    const refs = before ? Object.values(document.steps).filter(item => item.narrationIds.includes(before.id)).map(item => item.id) : [step.id]
    if (refs.length > 1 && !target.shared) conflict('shared-decision-required', index, undefined, refs)
    if (target.shared === 'edit-shared' && !sameIds(target.affectedStepIds ?? [], refs)) conflict('shared-scope-changed', index, undefined, refs)
    if (target.shared === 'fork' && target.affectedStepIds?.length) conflict('shared-scope-unexpected', index)
    const segments = candidate.result.segments.filter(segment => target.segmentIds.includes(segment.id))
    if (segments.length !== target.segmentIds.length) { conflict('segment-missing', index); continue }
    const sourceText = segments.map(segment => segment.text).join('\n')
    const atoms = (before?.content ?? []).flatMap((node, position) => node.type === 'text' ? [] : [{ key: atomKey(position, node), node }])
    const atomMap = new Map(atoms.map(atom => [atom.key, atom.node])), preserved = new Set<string>(), discarded = new Set(target.discardAtoms ?? [])
    let proposed: NarrationNode[] = []
    if (target.content === undefined && sourceText === shown(before?.content ?? []) && !discarded.size) {
      proposed = structuredClone(before?.content ?? []); atoms.forEach(atom => preserved.add(atom.key))
    } else if (target.content === undefined) proposed = [{ type: 'text', text: sourceText }]
    else for (const part of target.content) {
      if (part.type === 'text') proposed.push({ type: 'text', text: part.text })
      else {
        const atom = atomMap.get(part.key)
        if (!atom) conflict('atom-unknown', index, part.key)
        else if (preserved.has(part.key) || discarded.has(part.key)) conflict('atom-repeated', index, part.key)
        else { preserved.add(part.key); proposed.push(structuredClone(atom)) }
      }
    }
    for (const key of discarded) {
      const atom = atomMap.get(key)
      if (!atom) conflict('atom-unknown', index, key)
      else { result.impact.removedAtoms.push(key); if (atom.type === 'cue') removedCues.add(atom.id) }
    }
    for (const atom of atoms) if (!preserved.has(atom.key) && !discarded.has(atom.key)) conflict('protected-atom-unresolved', index, atom.key)
    const fork = Boolean(before && target.shared === 'fork')
    const outputId = !before || fork ? generate('narration', address) : before.id
    const cueChanges: { from: string, to: string }[] = []
    if ((!before || fork) && globalIds.has(outputId)) conflict('generated-id-collision', index, outputId)
    if (fork) proposed = proposed.map(node => {
      if (node.type !== 'cue') return node
      const id = generate('cue', address, node.id)
      if (globalIds.has(id)) conflict('generated-id-collision', index, id)
      globalIds.add(id); cueChanges.push({ from: node.id, to: id })
      if (own(document.production.cueTimings ?? {}, node.id)) {
        output.production.cueTimings ??= {}
        output.production.cueTimings[id] = structuredClone(document.production.cueTimings![node.id]!)
      }
      return { ...node, id }
    })
    const narration: Narration = { ...before, id: outputId, content: proposed, provenance: { type: 'transcription', transcriptionId: candidate.transcriptionId, revision: candidate.revision, assetId: candidate.audio.assetId, audioSha256: candidate.audio.sha256, segmentIds: segments.map(segment => segment.id) } }
    const prior = changed.get(outputId)
    if (prior && JSON.stringify(prior) !== JSON.stringify(narration)) conflict('shared-content-conflict', index)
    else { changed.set(outputId, narration); Object.defineProperty(output.narrations, outputId, { value: narration, enumerable: true, configurable: true, writable: true }) }
    if (!before) output.steps[step.id]!.narrationIds.push(outputId)
    else if (fork) {
      output.steps[step.id]!.narrationIds = output.steps[step.id]!.narrationIds.map(id => id === before.id ? outputId : id)
      if (own(document.production.narrationOverrides ?? {}, before.id)) {
        output.production.narrationOverrides ??= {}
        output.production.narrationOverrides[outputId] = structuredClone(document.production.narrationOverrides![before.id]!)
      }
      result.impact.forks.push({ from: before.id, to: outputId, stepId: step.id, cues: cueChanges })
    }
    globalIds.add(outputId)
    result.impact.narrationIds.push(outputId)
    result.impact.stepIds.push(...fork ? [step.id] : refs)
    if (refs.length > 1 && !fork) result.impact.sharedStepIds.push(...refs)
    result.targets.push({ sectionId: section.id, stepId: step.id, narrationId: before?.id, outputNarrationId: outputId, segmentIds: segments.map(segment => segment.id), sourceText, before: structuredClone(before?.content ?? []), proposed: structuredClone(proposed), atoms: structuredClone(atoms) })
  }
  const remainingCues = new Set(Object.values(output.narrations).flatMap(narration => narration.content.flatMap(node => node.type === 'cue' ? [node.id] : [])))
  for (const id of removedCues) if (!remainingCues.has(id) && own(document.production.cueTimings ?? {}, id) && !draft.removeCueTimings?.includes(id)) conflict('cue-timing-confirmation-required', undefined, id)
  for (const id of draft.removeCueTimings ?? []) {
    if (!removedCues.has(id) || remainingCues.has(id) || !own(document.production.cueTimings ?? {}, id)) conflict('cue-timing-unexpected', undefined, id)
    else { delete output.production.cueTimings![id]; result.impact.removedCueTimings.push(id) }
  }
  for (const field of ['narrationIds', 'stepIds', 'sharedStepIds', 'removedAtoms'] as const) result.impact[field] = [...new Set(result.impact[field])]
  if (!result.conflicts.length) {
    const checked = validateDocument(output)
    if (!checked.document || checked.issues.some(issue => issue.severity === 'error')) for (const issue of checked.issues.filter(issue => issue.severity === 'error')) conflict('document-invalid', undefined, issue.path)
  }
  return { ...result, ...result.conflicts.length ? {} : { content: output } }
}
