import { isRecord, jsonResponse, problemResponse } from '@lincyaw/kernel'
import type { Route, SpeechSettingsChange } from '@lincyaw/kernel'
import { OperatorSpeechSettings, SpeechSettingsError } from '@lincyaw/kernel/node'

/** Global operator route: works before opening a document and never returns credential values. */
export function speechSettingsRoute(directory: string, fallback: (name: string) => string | undefined): Route {
  const settings = new OperatorSpeechSettings(directory, fallback)
  return { role: 'owner', maxBody: 16384, handle: async request => {
    try {
      if (request.method === 'GET') return jsonResponse(settings.read(), 200, { 'cache-control': 'no-store' })
      if (request.method !== 'POST') return problemResponse(405, 'GET or POST')
      const body: unknown = await request.json().catch(() => undefined)
      if (!isRecord(body) || typeof body.revision !== 'string' || !['save', 'clear'].includes(String(body.action)) || Object.keys(body).some(key => !['action', 'revision', 'apiKey'].includes(key))
        || body.action === 'save' && body.apiKey !== undefined && typeof body.apiKey !== 'string') return problemResponse(400, 'speech-settings-invalid')
      return jsonResponse(await settings.change(body as unknown as SpeechSettingsChange), 200, { 'cache-control': 'no-store' })
    } catch (error) {
      const code = error instanceof SpeechSettingsError ? error.code : 'speech-settings-unavailable'
      return problemResponse(code === 'speech-settings-invalid' ? 400 : code === 'speech-settings-conflict' || code === 'speech-settings-busy' ? 409 : 503, code)
    }
  } }
}
