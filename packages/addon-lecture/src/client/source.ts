import { siteBase } from '@lincyaw/host'
import type { ServerClient } from '@lincyaw/host'
import { ABSOLUTE_URL, isRecord } from '@lincyaw/kernel'
import type { ProductionBinding, ProductionPlan, ProductionPlanQuery } from '@lincyaw/kernel'
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
  track(id: string, planId?: string, signal?: AbortSignal): Promise<LectureTrack | undefined>
  media(id: string, src: string): Promise<string>
  plan?(query: ProductionPlanQuery, signal?: AbortSignal): Promise<ProductionPlan>
  productionMedia?(binding: ProductionBinding, clipId: string, signal?: AbortSignal): Promise<string>
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
    track: async (id, planId, signal) => readTrackAnswer(await server.fetch(LECTURE_ID, `tracks/${encodeURIComponent(id)}${planId ? `?planId=${encodeURIComponent(planId)}` : ''}`, { signal })),
    plan: (query, signal) => readAnswer<ProductionPlan>(server.fetch(LECTURE_ID, `production-plan?source=${encodeURIComponent(JSON.stringify(query.source))}&irRevision=${encodeURIComponent(query.irRevision)}`, { signal })),
    async productionMedia(binding, clipId, signal) {
      const query = `source=${encodeURIComponent(JSON.stringify(binding.source))}&irRevision=${encodeURIComponent(binding.irRevision)}&planId=${encodeURIComponent(binding.planId)}&clipId=${encodeURIComponent(clipId)}`
      const response = await server.fetch(LECTURE_ID, `production-media?${query}`, { signal })
      if (!response.ok) throw new Error(await refusal(response))
      return URL.createObjectURL(await response.blob())
    },
    async media(id, src) {
      if (ABSOLUTE_URL.test(src)) return src
      const response = await server.fetch(LECTURE_ID, `tracks/${encodeURIComponent(id)}/${src.split('/').map(encodeURIComponent).join('/')}`)
      if (!response.ok) throw new Error(`${src}: HTTP ${response.status}`)
      return URL.createObjectURL(await response.blob())
    },
  }
}

export async function readAnswer<T = unknown>(response: Promise<Response>): Promise<T> {
  const r = await response
  const body: unknown = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(isRecord(body) && typeof body.error === 'string' ? body.error : `HTTP ${r.status}`)
  return body as T
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
    track: async (id, _planId, signal) => readTrackAnswer(await fetch(new URL(`${encodeURIComponent(id)}/track.json`, await base()), { cache: 'no-cache', signal })),
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
