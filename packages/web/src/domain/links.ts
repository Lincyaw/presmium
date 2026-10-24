import type { IRDocument } from '@lincyaw/kernel'

export function urlPath(path: string): string {
  return encodeURI(path).replace(/[#?]/g, char => encodeURIComponent(char))
}

export const SERVICE_WORKER = 'presmium-sw.js'

export const SLIDE_PARAM = 'slide'

/** The address of a form's page (the web form's, or the slides') that shows a slide and its step. */
export function positionUrl(base: string, slide: number, step = 0): string {
  return `${base.replace(/\/$/, '')}/?${SLIDE_PARAM}=${slide}${step > 0 && Number.isFinite(step) ? `&step=${step}` : ''}`
}

/** What a slides page prints (an export): each slide at its last step, or every step with `steps`; `slides` by number from 1, else all. */
export interface SlidesPrintQuery {
  steps: boolean
  slides?: number[]
}

/** The attribute of the root element of a printing page once its slides are ready to print. */
export const PRINTED_ATTRIBUTE = 'data-presmium-printed'

export function printQuery(print: SlidesPrintQuery): string {
  return `?print${print.steps ? '&steps' : ''}${print.slides ? `&slides=${print.slides.join(',')}` : ''}`
}

export function parsePrintQuery(search: string): SlidesPrintQuery | undefined {
  const params = new URLSearchParams(search)
  if (!params.has('print')) return undefined
  const slides = params.get('slides')?.split(',').map(Number).filter(n => Number.isInteger(n) && n > 0)
  return { steps: params.has('steps'), ...slides ? { slides } : {} }
}

const POSITION_PARAMS = [SLIDE_PARAM, 'section', 'step', 'view']

/** The query string with its position parameters replaced by the given position, or removed. */
export function withPositionQuery(search: string, position?: { view: string, section: string, step: number }): string {
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

export interface PositionQuery {
  section?: string
  step?: number
  view?: string
}

export function parsePositionQuery(search: string, doc: IRDocument): PositionQuery {
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
