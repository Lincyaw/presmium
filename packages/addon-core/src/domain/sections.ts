import { followedPlace, stepTrail } from '@lincyaw/kernel'
import type { FollowAnchor, StepKeys } from '@lincyaw/kernel'

export const SECTION_KEY = 'presmiumId'
export const STEPS_KEY = 'presmiumSteps'
export const BACK_KEY = 'presmiumBack'
const TRAIL_KEY = 'presmiumTrail'

export interface SlideSection {
  id?: string
  steps: StepKeys
  back?: string
}

const isTrail = (value: unknown): value is string[] => Array.isArray(value) && value.every(key => typeof key === 'string')
const isKeys = (value: unknown): value is StepKeys => Array.isArray(value) && value.every(isTrail)
const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined)

export function slideSectionOf(frontmatter: Record<string, unknown> | undefined): SlideSection {
  const id = text(frontmatter?.[SECTION_KEY])
  const back = text(frontmatter?.[BACK_KEY])
  const steps = frontmatter?.[STEPS_KEY]
  return { ...id ? { id } : {}, steps: isKeys(steps) ? steps : [[]], ...back ? { back } : {} }
}

export interface SlideSections {
  readonly named: boolean
  idOf(no: number): string | undefined
  noOf(id: string): number | undefined
  anchorOf(no: number, step: number): FollowAnchor
  placeOf(position: FollowAnchor & { step: number }): { no: number, section: string, step: number } | undefined
}

export function slideSections(slides: readonly ({ no: number } & SlideSection)[]): SlideSections {
  const byNo = new Map<number, SlideSection>()
  const numbers = new Map<string, number>()
  for (const slide of slides) {
    if (slide.id === undefined) continue
    byNo.set(slide.no, slide)
    if (!numbers.has(slide.id)) numbers.set(slide.id, slide.no)
  }
  const keysOf = (id: string) => {
    const no = numbers.get(id)
    return no === undefined ? undefined : byNo.get(no)!.steps
  }
  return {
    named: byNo.size > 0,
    idOf: no => byNo.get(no)?.id,
    noOf: id => numbers.get(id),
    anchorOf(no, step) {
      const slide = byNo.get(no)
      return slide ? { section: slide.id, trail: stepTrail(slide.steps, step), ...slide.back ? { back: slide.back } : {} } : {}
    },
    placeOf(position) {
      const place = followedPlace(position, keysOf)
      return place && { ...place, no: numbers.get(place.section)! }
    },
  }
}

type State = Readonly<Record<string, unknown>>

const PAGE_FIELDS = ['page', 'clicks', 'clicksTotal', 'cursor']

export function sharedOut(state: State, sections: SlideSections): State {
  if (typeof state.page !== 'number') return state
  const { section, trail, back } = sections.anchorOf(state.page, typeof state.clicks === 'number' ? state.clicks : 0)
  return section === undefined ? state : { ...state, [SECTION_KEY]: section, [TRAIL_KEY]: trail ?? null, [BACK_KEY]: back ?? null }
}

export function sharedReceiver(sections: () => SlideSections): (patch: State) => State {
  const sender: FollowAnchor & { step: number } = { step: 0 }
  return (patch) => {
    const { [SECTION_KEY]: id, [TRAIL_KEY]: trail, [BACK_KEY]: back, ...rest } = patch
    if (SECTION_KEY in patch) sender.section = text(id)
    if (TRAIL_KEY in patch) sender.trail = isTrail(trail) ? trail : undefined
    if (BACK_KEY in patch) sender.back = text(back)
    if (typeof rest.clicks === 'number') sender.step = rest.clicks
    const own = sections()
    if (sender.section === undefined || !own.named) return rest
    const others = Object.fromEntries(Object.entries(rest).filter(([key]) => !PAGE_FIELDS.includes(key)))
    const place = own.placeOf(sender)
    if (!place) return others
    const moved = [SECTION_KEY, TRAIL_KEY, BACK_KEY, 'page', 'clicks'].some(key => key in patch)
    const cursor = place.section === sender.section && 'cursor' in rest ? { cursor: rest.cursor } : {}
    return { ...others, ...cursor, ...moved ? { page: place.no, clicks: place.step } : {} }
  }
}

export function drawingsOut(state: State, sections: SlideSections): State {
  if (!sections.named) return state
  return Object.fromEntries(Object.entries(state).map(([no, drawing]) => [sections.idOf(Number(no)) ?? no, drawing]))
}

export function drawingsIn(patch: State, sections: SlideSections): State {
  if (!sections.named) return patch
  return Object.fromEntries(Object.entries(patch).flatMap(([id, drawing]) => {
    const no = sections.noOf(id)
    return no === undefined ? [] : [[String(no), drawing]]
  }))
}
