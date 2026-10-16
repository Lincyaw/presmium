import type { EngineDefinition } from '../../domain/index.ts'
import { openaiEngine } from './openai.ts'
import type { EngineAdapter } from './types.ts'
import { volcengineEngine } from './volcengine.ts'

export type { EngineAdapter, EngineAudio, EngineInput, EngineSynthesis } from './types.ts'
export { blobOf } from './openai.ts'

/** The adapter of an engine the operator defined. */
export function engineAdapter(engine: EngineDefinition): EngineAdapter {
  return engine.kind === 'volcengine' ? volcengineEngine(engine) : openaiEngine(engine)
}
