import { siteBase } from '@lincyaw/host'
import type { ServerClient } from '@lincyaw/host'
import { ABSOLUTE_URL, isRecord } from '@lincyaw/kernel'
import { LECTURE_ID, parseTrack } from '../domain/index.ts'
import type { LectureTrack, Voice } from '../domain/index.ts'

export interface LectureSummary {
  id: string
  lang?: string
  voice?: Voice
  duration?: number
}

export interface LectureSource {
  list(): Promise<LectureSummary[]>
  track(id: string): Promise<LectureTrack | undefined>
  media(id: string, src: string): Promise<string>
}

function summaries(value: unknown): LectureSummary[] {
  return Array.isArray(value) ? value.filter((v): v is LectureSummary => isRecord(v) && typeof v.id === 'string') : []
}

/** Why the server refused: its `{ error }`, or the text it answered (a proxy's), else the status. */
async function refusal(response: Response): Promise<string> {
  const text = (await response.text().catch(() => '')).trim()
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {}
  if (isRecord(body) && typeof body.error === 'string') return body.error
  return text && !text.startsWith('<') ? `HTTP ${response.status}: ${text.slice(0, 300)}` : `HTTP ${response.status}`
}

async function readTrackAnswer(response: Response): Promise<LectureTrack | undefined> {
  if (response.status === 404) return undefined
  if (!response.ok) throw new Error(await refusal(response))
  const { track, problems } = parseTrack(await response.json())
  if (!track) throw new Error(problems.join('; '))
  return track
}

export function serverSource(server: ServerClient): LectureSource {
  return {
    list: async () => summaries(await (await server.fetch(LECTURE_ID, 'tracks')).json()),
    track: async id => readTrackAnswer(await server.fetch(LECTURE_ID, `tracks/${encodeURIComponent(id)}`)),
    async media(id, src) {
      if (ABSOLUTE_URL.test(src)) return src
      const response = await server.fetch(LECTURE_ID, `tracks/${encodeURIComponent(id)}/${src.split('/').map(encodeURIComponent).join('/')}`)
      if (!response.ok) throw new Error(`${src}: HTTP ${response.status}`)
      return URL.createObjectURL(await response.blob())
    },
  }
}

export interface EngineChoice {
  engine: string
  provider: string
  local: boolean
}

export interface SpeechChoices {
  transcribe?: EngineChoice
  synthesize?: EngineChoice & { voices: { id: string, label: string, cloned?: boolean }[] }
}

export interface LectureEditing {
  speech(engine?: string): Promise<SpeechChoices>
  transcribe(id: string): Promise<LectureTrack>
  editUtterance(id: string, utterance: string, text: string): Promise<LectureTrack>
  synthesize(id: string, voice: string, engine?: string): Promise<LectureTrack>
}

export async function readAnswer<T = unknown>(response: Promise<Response>): Promise<T> {
  const r = await response
  const body: unknown = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(isRecord(body) && typeof body.error === 'string' ? body.error : `HTTP ${r.status}`)
  return body as T
}

async function readChangedTrack(response: Promise<Response>): Promise<LectureTrack> {
  const body = await readAnswer(response)
  const track = isRecord(body) ? parseTrack(body.track).track : undefined
  if (!track) throw new Error('the server gave no track')
  return track
}

export function serverEditing(server: ServerClient): LectureEditing {
  const send = (path: string, method: string, body: unknown = {}) => server.fetch(LECTURE_ID, path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const at = (id: string) => `editing/${encodeURIComponent(id)}`
  return {
    speech: engine => readAnswer<SpeechChoices>(server.fetch(LECTURE_ID, engine ? `speech?engine=${encodeURIComponent(engine)}` : 'speech')),
    transcribe: id => readChangedTrack(send(`${at(id)}/transcribe`, 'POST')),
    editUtterance: (id, utterance, text) => readChangedTrack(send(`${at(id)}/utterances/${encodeURIComponent(utterance)}`, 'PUT', { text })),
    synthesize: (id, voice, engine) => readChangedTrack(send(`${at(id)}/synthesize`, 'POST', { voice, ...engine ? { engine } : {} })),
  }
}

/** The lectures published at the first of `bases` that has an index (the last when none answers). */
export function staticSource(bases: readonly string[]): LectureSource {
  let located: Promise<string> | undefined
  const base = () => located ??= (async () => {
    for (const candidate of bases.slice(0, -1)) {
      const response = await fetch(new URL('index.json', candidate), { method: 'HEAD' }).catch(() => undefined)
      if (response?.ok) return candidate
    }
    return bases.at(-1)!
  })()
  return {
    list: async () => {
      const response = await fetch(new URL('index.json', await base()))
      return response.ok ? summaries(await response.json()) : []
    },
    track: async id => readTrackAnswer(await fetch(new URL(`${encodeURIComponent(id)}/track.json`, await base()), { cache: 'no-cache' })),
    media: async (id, src) => (ABSOLUTE_URL.test(src) ? src : new URL(`${encodeURIComponent(id)}/${src.split('/').map(encodeURIComponent).join('/')}`, await base()).href),
  }
}

/**
 * Where a static page looks for its lectures: `presmium.lecture.url` when the document names it; otherwise `lecture/` under
 * the page, where a site of several documents puts each one's lectures in its own directory, then `../lecture/` beside
 * the web form, where a document's own build puts them.
 */
export function staticBases(config: Record<string, unknown> | undefined): string[] {
  const site = new URL(siteBase(), location.href)
  const configured = typeof config?.url === 'string' && config.url ? config.url : undefined
  return (configured ? [configured] : ['lecture/', '../lecture/']).map((base) => {
    const url = new URL(base, site).href
    return url.endsWith('/') ? url : `${url}/`
  })
}

export function lectureSource(server: ServerClient, config: unknown): LectureSource {
  return server.available ? serverSource(server) : staticSource(staticBases(isRecord(config) ? config : undefined))
}
