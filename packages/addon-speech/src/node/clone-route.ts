import { jsonResponse, problemResponse } from '@lincyaw/kernel'
import type { CloneInput } from './backend.ts'
import { errorResponse } from './errors.ts'

/** The clone route's body: a sample and a recorded consent statement, each at most this size. */
export const MAX_CLONE_AUDIO = 10 * 1024 * 1024

const field = (form: FormData, name: string) => {
  const value = form.get(name)
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/**
 * `clone` (POST, multipart): `voice`, `speaker`, `scope`, `confirmed=1` and the files `sample` and `statement`;
 * optionally `engine`, `lang` and `text`. The consent is registered first, then the provider trains, which costs
 * money, hence the explicit confirmation. `clone/status` (GET `?engine=&voice=`): the training's state.
 */
export async function cloneRoute(request: Request, rest: string, speech: { cloneVoice(input: CloneInput, signal?: AbortSignal): Promise<unknown>, cloneStatus(engine: string | undefined, voice: string, signal?: AbortSignal): Promise<unknown> }): Promise<Response> {
  try {
    if (rest === 'status') {
      if (request.method !== 'GET') return problemResponse(405, 'GET clone/status?engine=&voice=')
      const query = new URL(request.url).searchParams
      const voice = query.get('voice')?.trim()
      if (!voice) return problemResponse(400, 'clone/status needs ?voice=')
      return jsonResponse(await speech.cloneStatus(query.get('engine')?.trim() || undefined, voice, request.signal))
    }
    if (rest) return problemResponse(404, 'the routes are clone and clone/status')
    if (request.method !== 'POST') return problemResponse(405, 'POST multipart form data to clone')
    const form = await request.formData().catch(() => undefined)
    if (!form) return problemResponse(400, 'clone takes multipart form data')
    if (form.get('confirmed') !== '1') return problemResponse(409, 'training a cloned voice is paid for at the provider: send confirmed=1 once the owner has confirmed it')
    const voice = field(form, 'voice'), speaker = field(form, 'speaker'), scope = field(form, 'scope')
    const sample = form.get('sample'), statement = form.get('statement')
    if (!voice || !speaker || !scope) return problemResponse(400, 'clone needs voice, speaker and scope')
    if (!(sample instanceof Blob) || !(statement instanceof Blob)) return problemResponse(400, 'clone needs the files sample (the voice to learn) and statement (the speaker reading the consent statement)')
    if (sample.size > MAX_CLONE_AUDIO || statement.size > MAX_CLONE_AUDIO) return problemResponse(413, 'each recording is at most 10 MB')
    const bytes = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer())
    const engine = field(form, 'engine'), lang = field(form, 'lang'), text = field(form, 'text')
    return jsonResponse(await speech.cloneVoice({
      ...engine ? { engine } : {},
      voice,
      sample: await bytes(sample),
      sampleMime: sample.type,
      ...lang ? { lang } : {},
      ...text ? { text } : {},
      consent: { speaker, scope, statement: await bytes(statement), statementMime: statement.type },
    }, request.signal))
  } catch (error) {
    return errorResponse(error)
  }
}
