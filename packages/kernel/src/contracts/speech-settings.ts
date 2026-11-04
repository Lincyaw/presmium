import type { Schema } from '@cfworker/json-schema'

/** Operator configuration is separate from document voice choices. Secret values are write-only. */
export interface SpeechSettingsAnswer {
  provider: 'volcengine'
  model: 'seed-tts-2.0'
  revision: string
  configured: boolean
  appIdConfigured?: boolean
  source: 'saved' | 'environment' | 'none'
  stored: boolean
  writable: boolean
  verification: 'configuration-only'
}

export type SpeechSettingsChange =
  | { action: 'save', revision: string, apiKey?: string, appId?: string }
  | { action: 'clear', revision: string }

export interface SpeechSettings {
  read(): SpeechSettingsAnswer
  change(change: SpeechSettingsChange): Promise<SpeechSettingsAnswer>
}

export const SPEECH_SETTINGS_CHANGE_SCHEMA: Schema = {
  type: 'object', additionalProperties: false,
  properties: { action: { enum: ['save', 'clear'] }, revision: { type: 'string', maxLength: 200 }, apiKey: { type: 'string', maxLength: 8192 }, appId: { type: 'string', maxLength: 32 } },
  required: ['action', 'revision'],
}
