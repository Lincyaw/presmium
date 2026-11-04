import { jsonResponse, problemResponse } from '@lincyaw/kernel'
import type { Route, SpeechSettings } from '@lincyaw/kernel'
import { SpeechSettingsError, validateSpeechSettingsChange } from '@lincyaw/kernel/node'

/** Global operator route: works before opening a document and never returns credential values. */
export function speechSettingsRoute(settings: SpeechSettings): Route {
  return { role: 'owner', maxBody: 16384, handle: async request => {
    try {
      if (request.method === 'GET') return jsonResponse(settings.read(), 200, { 'cache-control': 'no-store' })
      if (request.method !== 'POST') return problemResponse(405, 'GET or POST')
      const body: unknown = await request.json().catch(() => undefined)
      if (!validateSpeechSettingsChange(body)) return problemResponse(400, 'speech-settings-invalid')
      return jsonResponse(await settings.change(body), 200, { 'cache-control': 'no-store' })
    } catch (error) {
      const code = error instanceof SpeechSettingsError ? error.code : 'speech-settings-unavailable'
      return problemResponse(code === 'speech-settings-invalid' ? 400 : code === 'speech-settings-conflict' || code === 'speech-settings-busy' ? 409 : 503, code)
    }
  } }
}
