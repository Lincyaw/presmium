import { isRecord } from '@lincyaw/kernel'
import { howToDefine } from './engines.ts'

export const SPEECH_ID = 'presmium.speech'

export const PROTOCOL_PATH = 'v1'

export const CONSENT_PATH = 'consent'

/** Training a cloned voice (`clone`) and its status (`clone/status`); for the owner only. */
export const CLONE_PATH = 'clone'

export const DEFAULT_CONSENT_DIR = 'consent'

export interface DeckSpeechConfig {
  engine?: string
  transcribe?: string
}

export interface ConfigProblem {
  severity: 'error' | 'warning'
  message: string
}

const DEFINITION = new Set(['url', 'baseUrl', 'base_url', 'endpoint', 'key', 'keyEnv', 'apiKey', 'api_key', 'token', 'tokenEnv', 'secret', 'provider', 'appid', 'appId', 'model'])
const OPERATOR = new Set(['cloned', 'consentDir'])

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
