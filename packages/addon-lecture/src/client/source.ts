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

async function readTrackAnswer(response: Response): Promise<LectureTrack | undefined> {
  if (response.status === 404) return undefined
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
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

export function staticSource(base: string): LectureSource {
  return {
    list: async () => {
      const response = await fetch(new URL('index.json', base))
      return response.ok ? summaries(await response.json()) : []
    },
    track: async id => readTrackAnswer(await fetch(new URL(`${encodeURIComponent(id)}/track.json`, base), { cache: 'no-cache' })),
    media: async (id, src) => (ABSOLUTE_URL.test(src) ? src : new URL(`${encodeURIComponent(id)}/${src.split('/').map(encodeURIComponent).join('/')}`, base).href),
  }
}

export function staticBase(config: Record<string, unknown> | undefined): string {
  const configured = typeof config?.url === 'string' && config.url ? config.url : undefined
  const site = new URL(import.meta.env.BASE_URL ?? '/', location.href)
  const base = configured ?? '../lecture/'
  const url = new URL(base, site)
  return url.href.endsWith('/') ? url.href : `${url.href}/`
}

export function lectureSource(server: ServerClient, config: unknown): LectureSource {
  return server.available ? serverSource(server) : staticSource(staticBase(isRecord(config) ? config : undefined))
}
