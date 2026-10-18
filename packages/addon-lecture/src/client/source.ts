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
  media(id: string, src: string): Promise<string>
}

const ABSOLUTE = /^[a-z][a-z\d+.-]*:/i

function summaries(value: unknown): LectureSummary[] {
  return Array.isArray(value) ? value.filter((v): v is LectureSummary => isRecord(v) && typeof v.id === 'string') : []
}

export class NotYetSynthesized extends Error {}

async function trackOf(response: Response): Promise<LectureTrack | undefined> {
  if (response.status === 409) throw new NotYetSynthesized(await response.text())
  if (!response.ok) return undefined
  return parseTrack(await response.json()).track
}

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
    speech: async engine => (await answer(server.fetch(LECTURE_ID, engine ? `speech?engine=${encodeURIComponent(engine)}` : 'speech'))) as SpeechChoices,
    transcribe: id => changed(send(`${at(id)}/transcribe`, 'POST')),
    editUtterance: (id, utterance, text) => changed(send(`${at(id)}/utterances/${encodeURIComponent(utterance)}`, 'PUT', { text })),
    synthesize: (id, voice, engine) => changed(send(`${at(id)}/synthesize`, 'POST', { voice, ...engine ? { engine } : {} })),
  }
}

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

export function staticBase(config: Record<string, unknown> | undefined): string {
  const configured = typeof config?.url === 'string' && config.url ? config.url : undefined
  const site = new URL(import.meta.env.BASE_URL ?? '/', location.href)
  const base = configured ?? '../lecture/'
  const url = new URL(base, site)
  return url.href.endsWith('/') ? url.href : `${url.href}/`
}
