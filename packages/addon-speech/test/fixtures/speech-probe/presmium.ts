// Routes of a test plugin (packages/addon-speech/test) that call the Node SPEECH service from the server's
// Node services, as the lecture plugin's renderer and agent tools do: `engines`, `synthesize` (a
// SynthesisRequest; the answer's `audio` is the path of the file in the deck's synthesis cache) and
// `transcribe` ({ audio: <that path>, lang }). Plain objects: tokens are compared by id, so the fixture
// needs no package to compile.
import { readFileSync } from 'node:fs'

interface Context { service(token: { id: string }): any }

const SPEECH = { id: 'presmium.speech' }

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

/** Runs a route's work with SPEECH; an error becomes a 409 with its message. */
function answer(ctx: Context, work: (speech: any) => Promise<unknown>): Promise<Response> {
  const speech = ctx.service(SPEECH)
  if (!speech) return Promise.resolve(json({ error: 'no SPEECH' }, 409))
  return work(speech).then(json, (error: unknown) => json({ error: error instanceof Error ? error.message : String(error) }, 409))
}

export default {
  id: 'fixture.speechProbe',
  version: '0.1.0',
  kernel: '^1.0.0',
  server: (ctx: Context) => ({
    routes: {
      engines: { handle: () => answer(ctx, speech => speech.engines()) },
      synthesize: { handle: (request: Request) => answer(ctx, async speech => speech.synthesize(await request.json())) },
      transcribe: {
        handle: (request: Request) => answer(ctx, async (speech) => {
          const { audio, lang } = await request.json() as { audio: string, lang?: string }
          return speech.transcribe({ audio: new Blob([readFileSync(audio)], { type: 'audio/wav' }), lang })
        }),
      },
    },
  }),
}
