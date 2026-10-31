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
