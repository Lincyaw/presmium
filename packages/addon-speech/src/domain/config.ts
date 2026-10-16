/**
 * The deck's side of speech (docs/ir.md 2.1): `presmium.speech` names the
 * default engines by id, `engine` for synthesis and `transcribe` for
 * transcription. A deck never defines an engine: addresses and credentials
 * come from the operator's environment (./engines.ts), so `url`, `keyEnv`
 * and the like are error diagnostics and are not used (docs/architecture.md
 * section 11). The operator's settings (`cloned`, `consentDir`) come from the
 * workspace configuration, never from the deck.
 */
import { isRecord } from '@presmium/kernel'
import { howToDefine } from './engines.ts'

/** The plugin's id: its routes are under `/__presmium/presmium.speech/`, its gateway contribution under `/presmium.speech/`. */
export const SPEECH_ID = 'presmium.speech'

/** The speech gateway's protocol (the OpenAI audio API shape) under the plugin's mount point. */
export const PROTOCOL_PATH = 'v1'

/** The owner's route that registers a consent record: `consent/<engine>/<voice>`. */
export const CONSENT_PATH = 'consent'

/** The default of `settings.presmium.speech.consentDir`, relative to the operator directory. */
export const DEFAULT_CONSENT_DIR = 'consent'

export interface DeckSpeechConfig {
  /** The default synthesis engine. */
  engine?: string
  /** The default transcription engine; else `engine`. */
  transcribe?: string
}

export interface ConfigProblem {
  severity: 'error' | 'warning'
  message: string
}

/** Keys that define an engine (its address or credentials), which a deck may not write. */
const DEFINITION = new Set(['url', 'baseUrl', 'base_url', 'endpoint', 'key', 'keyEnv', 'apiKey', 'api_key', 'token', 'tokenEnv', 'secret', 'provider', 'appid', 'appId', 'model'])
/** Operator settings (`settings.presmium.speech`), which a deck cannot set. */
const OPERATOR = new Set(['cloned', 'consentDir'])

/** The deck's `presmium.speech`, and what is wrong with it. */
export function deckSpeechConfig(value: unknown): { config: DeckSpeechConfig, problems: ConfigProblem[] } {
  const config: DeckSpeechConfig = {}
  const problems: ConfigProblem[] = []
  if (!isRecord(value)) return { config, problems }
  for (const [key, item] of Object.entries(value)) {
    if (key === 'engine' || key === 'transcribe') {
      if (typeof item === 'string' && item.trim()) config[key] = item.trim()
      else problems.push({ severity: 'error', message: `presmium.speech.${key} names an engine by its id, e.g. ${key}: volcengine` })
    } else if (key === 'engines') {
      for (const [id, definition] of Object.entries(isRecord(item) ? item : {})) {
        const fields = isRecord(definition) ? Object.keys(definition) : []
        problems.push({ severity: 'error', message: `presmium.speech.engines.${id}${fields.length ? ` (${fields.join(', ')})` : ''} is not used, as a deck only names engines: engine "${id}" is not defined; ${howToDefine(id)}` })
      }
    } else if (DEFINITION.has(key)) {
      problems.push({ severity: 'error', message: `presmium.speech.${key} is not used, as a deck only names engines; ${howToDefine(config.engine ?? (typeof value.engine === 'string' ? value.engine : '<id>'))}` })
    } else if (OPERATOR.has(key)) {
      problems.push({ severity: 'warning', message: `presmium.speech.${key} is an operator setting (settings.presmium.speech in presmium.workspace.yaml); the deck's is ignored` })
    } else {
      problems.push({ severity: 'warning', message: `presmium.speech.${key} is not a setting of speech (engine, transcribe); it is ignored` })
    }
  }
  return { config, problems }
}
