export interface AigcLabel {
  Label: '1'
  ContentProducer: string
  ProduceID: string
  ReservedCode1: string
  ContentPropagator: string
  PropagateID: string
  ReservedCode2: string
}

export function aigcLabel(producer: string, produceId: string): AigcLabel {
  return { Label: '1', ContentProducer: producer, ProduceID: produceId, ReservedCode1: '', ContentPropagator: '', PropagateID: '', ReservedCode2: '' }
}

export function aigcString(label: AigcLabel): string {
  return `AIGC=${JSON.stringify(label)}`
}
