import { DOCUMENT_VOICE_CATALOG_SCHEMA } from '@lincyaw/kernel'
import type { DocumentVoiceCatalogQuery } from '@lincyaw/kernel'
import type { ToolSpec } from './mcp.ts'

const document = { type: 'string', description: 'The served document directory.' }
export const VOICE_AUTHORING_TOOLS: ToolSpec[] = [
  {
    name: 'get_voice_authoring_capabilities', kind: 'read', structured: true,
    description: 'Reads actual configured speech engines, default synthesis engine and installed voiceover/preview implementation for the canonical source. Configuration-only discovery does not verify provider authentication or generation success. No scene compilation or synthesis; compiler-only stdio reports host-unavailable.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { document } },
    run: async call => call.host.voiceAuthoring ? call.host.voiceAuthoring.capabilities(await call.document(), call.caller.member, call.signal) : { status: 'unavailable', reason: 'host-unavailable', voiceover: false, preview: false, engines: [] },
  },
  {
    name: 'get_voice_catalog', kind: 'read', structured: true,
    description: 'Reads the same real voice catalogue as Web, without compiling scenes or generating audio. Supply an optional expected canonical source, engine and language. Returns available/unavailable distinctly, actual engine declarations and the saved source; source changes during discovery are rejected. Unknown rate/style ranges remain absent.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { document, query: structuredClone(DOCUMENT_VOICE_CATALOG_SCHEMA) } },
    run: async call => {
      if (!call.host.voiceAuthoring) throw Object.assign(new Error('voice-authoring-host-unavailable'), { status: 503 })
      return call.host.voiceAuthoring.catalog(await call.document(), call.args.query as DocumentVoiceCatalogQuery ?? {}, call.caller.member, call.signal)
    },
  },
]
