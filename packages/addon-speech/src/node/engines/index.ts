import type { Logger } from '@lincyaw/kernel'
import type { EngineDefinition } from '../../domain/index.ts'
import { edgeEngine } from './edge.ts'
import { openaiEngine } from './openai.ts'
import type { EngineAdapter } from './types.ts'
import { volcengineEngine } from './volcengine.ts'

export type { EngineAdapter, EngineCloneRequest, EngineCloneStatus, EngineSynthesisRequest, EngineSynthesisResult, EngineTranscriptionRequest } from './types.ts'
export { blobOf } from './openai.ts'

export function engineAdapter(engine: EngineDefinition, log?: Logger): EngineAdapter {
  return engine.kind === 'volcengine' ? volcengineEngine(engine, log) : engine.kind === 'edge' ? edgeEngine(engine) : openaiEngine(engine)
}
