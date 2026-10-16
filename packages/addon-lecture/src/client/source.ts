/**
 * Where the lecture view finds the lectures (docs/ir.md 6.3): from the
 * server's routes under `presmium dev` and `presmium serve`; in a static
 * build, from the `lecture` renderer's output, `../lecture/` of the same
 * site, or the address `presmium.lecture.url` names when the two are
 * deployed apart.
 */
import type { ServerClient } from '@presmium/host'
import { isRecord } from '@presmium/kernel'
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
  /** A media file of a lecture (`src` relative to its directory, or a URL) as a URL the page can play. */
  media(id: string, src: string): Promise<string>
}

const ABSOLUTE = /^[a-z][a-z\d+.-]*:/i

function summaries(value: unknown): LectureSummary[] {
  return Array.isArray(value) ? value.filter((v): v is LectureSummary => isRecord(v) && typeof v.id === 'string') : []
}

async function trackOf(response: Response): Promise<LectureTrack | undefined> {
  if (!response.ok) return undefined
  return parseTrack(await response.json()).track
}

/** The lectures of the deck the server serves; media is fetched with the page's document, so any server mode answers it. */
export function serverSource(server: ServerClient): LectureSource {
  return {
    list: async () => summaries(await (await server.fetch(LECTURE_ID, 'tracks')).json()),
    track: async id => trackOf(await server.fetch(LECTURE_ID, `tracks/${encodeURIComponent(id)}`)),
    async media(id, src) {
      if (ABSOLUTE.test(src)) return src
      const response = await server.fetch(LECTURE_ID, `tracks/${encodeURIComponent(id)}/${src.split('/').map(encodeURIComponent).join('/')}`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return URL.createObjectURL(await response.blob())
    },
  }
}

/** An engine of the speech service, as the editor names it (N-08). */
export interface EngineChoice {
  engine: string
  provider: string
  local: boolean
}

export interface SpeechChoices {
  transcribe?: EngineChoice
  synthesize?: EngineChoice & { voices: { id: string, label: string, cloned?: boolean }[] }
}

/** Work on a recorded lecture's words (editors, `presmium dev` and `presmium serve`); each call gives the track written. */
export interface LectureEditing {
  speech(): Promise<SpeechChoices>
  transcribe(id: string): Promise<LectureTrack>
  editUtterance(id: string, utterance: string, text: string): Promise<LectureTrack>
  synthesize(id: string, voice: string, engine?: string): Promise<LectureTrack>
}

async function answer(response: Promise<Response>): Promise<unknown> {
  const r = await response
  const body: unknown = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(isRecord(body) && typeof body.error === 'string' ? body.error : `HTTP ${r.status}`)
  return body
}

async function changed(response: Promise<Response>): Promise<LectureTrack> {
  const body = await answer(response)
  const track = isRecord(body) ? parseTrack(body.track).track : undefined
  if (!track) throw new Error('the server gave no track')
  return track
}

export function serverEditing(server: ServerClient): LectureEditing {
  const send = (path: string, method: string, body: unknown = {}) => server.fetch(LECTURE_ID, path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const at = (id: string) => `editing/${encodeURIComponent(id)}`
  return {
    speech: async () => (await answer(server.fetch(LECTURE_ID, 'speech'))) as SpeechChoices,
    transcribe: id => changed(send(`${at(id)}/transcribe`, 'POST')),
    editUtterance: (id, utterance, text) => changed(send(`${at(id)}/utterances/${encodeURIComponent(utterance)}`, 'PUT', { text })),
    synthesize: (id, voice, engine) => changed(send(`${at(id)}/synthesize`, 'POST', { voice, ...engine ? { engine } : {} })),
  }
}

/** The lectures a build published under `base` (a URL ending in `/`). */
export function staticSource(base: string): LectureSource {
  return {
    list: async () => {
      const response = await fetch(new URL('index.json', base))
      return response.ok ? summaries(await response.json()) : []
    },
    track: async id => trackOf(await fetch(new URL(`${encodeURIComponent(id)}/track.json`, base), { cache: 'no-cache' })),
    media: async (id, src) => (ABSOLUTE.test(src) ? src : new URL(`${encodeURIComponent(id)}/${src.split('/').map(encodeURIComponent).join('/')}`, base).href),
  }
}

/** Where a static build's lectures are: `presmium.lecture.url`, else `../lecture/` beside the web form's base. */
export function staticBase(config: Record<string, unknown> | undefined): string {
  const configured = typeof config?.url === 'string' && config.url ? config.url : undefined
  const site = new URL(import.meta.env.BASE_URL ?? '/', location.href)
  const base = configured ?? '../lecture/'
  const url = new URL(base, site)
  return url.href.endsWith('/') ? url.href : `${url.href}/`
}
