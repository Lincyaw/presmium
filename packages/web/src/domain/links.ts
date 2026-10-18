import type { IRDocument } from '@presmium/kernel'
import type { FormOptions } from './config.ts'

export function urlPath(path: string): string {
  return encodeURI(path).replace(/[#?]/g, char => encodeURIComponent(char))
}

export function samePage(a: string, b: string): boolean {
  const page = (path: string) => path.replace(/(?:\.html|\/)$/, '')
  return page(a) === page(b)
}

export const SERVICE_WORKER = 'presmium-sw.js'

export const SOURCE_ENDPOINT = '/__presmium/source'

export const IR_ENDPOINT = '/__presmium/ir'

export const SERVER_PROXY = '^/__presmium/(?!(?:ir|source)(?:[/?]|$))'

export const SLIDE_PARAM = 'slide'

export function slideUrl(slidesUrl: string, options: FormOptions, slide: number, step = 0): string {
  const path = `${options.routerMode === 'hash' ? '/#/' : '/'}${slide}`
  return `${slidesUrl}${path}${step > 0 && Number.isFinite(step) ? `?clicks=${step}` : ''}`
}

export function webUrl(webBase: string, slide: number, step = 0): string {
  return `${webBase}/?${SLIDE_PARAM}=${slide}${step > 0 ? `&step=${step}` : ''}`
}

const POSITION_PARAMS = [SLIDE_PARAM, 'section', 'step', 'view']

export function viewSearch(search: string, position?: { view: string, section: string, step: number }): string {
  const params = new URLSearchParams(search)
  for (const name of POSITION_PARAMS) params.delete(name)
  if (position) {
    params.set('view', position.view)
    params.set('section', position.section)
    params.set('step', String(position.step))
  }
  const query = params.toString()
  return query ? `?${query}` : ''
}

export interface Requested {
  section?: string
  step?: number
  view?: string
}

export function requested(search: string, doc: IRDocument): Requested {
  const params = new URLSearchParams(search)
  const slide = Number(params.get(SLIDE_PARAM))
  const section = params.get('section') ?? doc.sections[slide - 1]?.id
  const step = Number(params.get('step'))
  return {
    section: doc.sections.some(s => s.id === section) ? section! : undefined,
    step: Number.isInteger(step) && step >= 0 ? step : undefined,
    view: params.get('view') ?? undefined,
  }
}
