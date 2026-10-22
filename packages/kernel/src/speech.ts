import type { AigcLabel } from './contracts/speech.ts'

export function speechEngineId(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')
}

export function aigcLabel(producer: string, produceId: string): AigcLabel {
  return { Label: '1', ContentProducer: producer, ProduceID: produceId, ReservedCode1: '', ContentPropagator: '', PropagateID: '', ReservedCode2: '' }
}

export function aigcString(label: AigcLabel): string {
  return `AIGC=${JSON.stringify(label)}`
}
