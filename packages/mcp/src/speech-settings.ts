import { hasRole, SPEECH_SETTINGS_CHANGE_SCHEMA } from '@lincyaw/kernel'
import type { SpeechSettingsChange } from '@lincyaw/kernel'
import type { Call, ToolSpec } from './mcp.ts'
import { systemLocale } from './messages.ts'

function service(call: Call) {
  if (call.caller.document !== undefined || call.caller.confirmed || !hasRole(call.caller.member, 'owner')) throw Object.assign(new Error('speech-settings-permission-denied'), { status: 403 })
  if (!call.host.speechSettings) throw Object.assign(new Error('speech-settings-unavailable'), { status: 503 })
  return call.host.speechSettings
}

export const SPEECH_SETTINGS_TOOLS: ToolSpec[] = [
  { name: 'get_speech_settings', kind: 'read', structured: true, workspace: 'author', access: 'workspace-owner',
    description: 'Reads operator speech configuration status. Secret values are write-only. Requires an owner credential covering the workspace; no provider call.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async call => service(call).read() },
  { name: 'change_speech_settings', kind: 'write', structured: true, workspace: 'author', access: 'workspace-owner',
    description: 'Saves or clears operator speech credentials after workspace write approval. Secret values never appear in the result. The server supplies the current revision; an optional revision pins an earlier read. No synthesis or provider request.',
    inputSchema: { ...SPEECH_SETTINGS_CHANGE_SCHEMA, required: ['action'] },
    run: async call => {
      const own = service(call), revision = own.read().revision
      const change = { revision, ...call.args } as SpeechSettingsChange
      await call.approve('write', messages => messages.changeSpeechSettings, { lang: systemLocale(), scope: 'workspace' })
      call.signal.throwIfAborted()
      try { return await own.change(change) }
      catch (error) { throw Object.assign(error as Error, { status: (error as Error).message === 'speech-settings-invalid' ? 400 : /conflict|busy/.test((error as Error).message) ? 409 : 503 }) }
    } },
]
