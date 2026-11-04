import { Validator } from '@cfworker/json-schema'
import { DOCUMENT_JSON_SCHEMA } from './document-schema.ts'
import type { Narration, TeachingDocument } from './contracts/document.ts'

const schema = new Validator({ $id: 'urn:presmium:step-narrations:1', $defs: structuredClone(DOCUMENT_JSON_SCHEMA.$defs), type: 'array', items: { $ref: '#/$defs/Narration' } }, '2020-12', false)

/** Replace one step's ordered script blocks, retaining entities still used by other steps. */
export function replaceStepNarrations(source: TeachingDocument, stepId: string, narrations: readonly Narration[]): TeachingDocument {
  const step = source.steps[stepId]
  if (!step || !source.sections[step.sectionId]?.stepOrder.includes(stepId)) throw new Error('document-narration-target')
  if (!schema.validate(narrations).valid) throw new Error('document-narration-content')
  const ids = narrations.map(narration => narration.id)
  if (new Set(ids).size !== ids.length) throw new Error('document-narration-target')
  const content = { ...source,
    steps: { ...source.steps, [stepId]: { ...step, narrationIds: ids } },
    narrations: { ...source.narrations },
    production: { ...source.production,
      ...source.production.narrationOverrides ? { narrationOverrides: { ...source.production.narrationOverrides } } : {},
      ...source.production.cueTimings ? { cueTimings: { ...source.production.cueTimings } } : {},
    },
  }
  for (const narration of narrations) {
    content.narrations[narration.id] = structuredClone(narration)
  }
  const used = new Set(Object.values(content.steps).flatMap(step => step.narrationIds))
  for (const id of step.narrationIds) if (!used.has(id)) {
    delete content.narrations[id]
    if (content.production.narrationOverrides) delete content.production.narrationOverrides[id]
  }
  const cues = new Set(Object.values(content.narrations).flatMap(narration => narration.content.flatMap(node => node.type === 'cue' ? [node.id] : [])))
  for (const id of Object.keys(content.production.cueTimings ?? {})) if (!cues.has(id)) delete content.production.cueTimings![id]
  return content
}
