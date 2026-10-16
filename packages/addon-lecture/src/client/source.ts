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
