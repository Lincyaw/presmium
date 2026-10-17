/**
 * Slides by section (D-4, F-85): the full and the student build number their
 * slides and clicks apart, while section and block ids are the same in both.
 * The core plugin's pass `slide-sections` writes into each slide's
 * frontmatter (through `hints.slides`, which the slides renderer copies
 * there) its section's id (`presmiumId`), the keys of its steps
 * (`presmiumSteps`, `stepKeys`) and, for a section only some audiences have,
 * the section to go back to (`presmiumBack`). The slides form reports a
 * position by them (`FollowAnchor`), moves to a position by them
 * (`followedPlace`), and carries what Slidev synchronizes by slide number
 * (the page and its clicks, the drawings) between windows by them, so a
 * learner of the student build follows a presenter of the full build to the
 * same slide and click.
 */
import { followedPlace, stepTrail } from '@presmium/viewer/domain'
import type { FollowAnchor, StepKeys } from '@presmium/viewer/domain'

/** The frontmatter key of a slide's section id; Slidev's shared state carries the sender's under it too. */
export const SECTION_KEY = 'presmiumId'
/** The frontmatter key of the keys of a slide's steps; absent for a slide without steps. */
export const STEPS_KEY = 'presmiumSteps'
/** The frontmatter key of the section to go back to; Slidev's shared state carries the sender's under it too. */
export const BACK_KEY = 'presmiumBack'
/** The key under which Slidev's shared state carries the trail of the sender's clicks. */
const TRAIL_KEY = 'presmiumTrail'

/** What a slide's frontmatter says of its section. */
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

/** The slides of a deck by section. */
export interface SlideSections {
  /** Whether the slides name their sections (a deck compiled without the core plugin's pass names none). */
  readonly named: boolean
  idOf(no: number): string | undefined
  noOf(id: string): number | undefined
  /** A position on slide `no` at click `step`, by ids. */
  anchorOf(no: number, step: number): FollowAnchor
  /** The slide, its section and the click of this deck for a position by ids (`followedPlace`); undefined when it has neither its section nor the one to go back to. */
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

/** The fields of Slidev's shared state that belong to the page it names: a window shows its own slide's total clicks. */
const PAGE_FIELDS = ['page', 'clicks', 'clicksTotal', 'cursor']

/**
 * Slidev's shared state (page, clicks, ...) as a window sends it: with its
 * page's position by ids. The trail and the section to go back to are always
 * there (null for none), as a transport sends only the fields that changed.
 */
export function sharedOut(state: State, sections: SlideSections): State {
  if (typeof state.page !== 'number') return state
  const { section, trail, back } = sections.anchorOf(state.page, typeof state.clicks === 'number' ? state.clicks : 0)
  return section === undefined ? state : { ...state, [SECTION_KEY]: section, [TRAIL_KEY]: trail ?? null, [BACK_KEY]: back ?? null }
}

/**
 * Slidev's shared state as a window receives it, patch by patch (a patch
 * holds the fields that changed): the page and click of the sender's
 * position by ids, in this deck's numbers (`SlideSections.placeOf`); while
 * the sender is where this deck has nothing to go to, no page nor what
 * belongs to it, so the window stays where it is. A sender whose slides
 * name no section is followed by its numbers.
 */
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
    // The sender's pointer is on the sender's slide: it shows only where this window shows the same section.
    const cursor = place.section === sender.section && 'cursor' in rest ? { cursor: rest.cursor } : {}
    return { ...others, ...cursor, ...moved ? { page: place.no, clicks: place.step } : {} }
  }
}

/** Slidev's drawings (by slide number) as a window sends them: by section id. */
export function drawingsOut(state: State, sections: SlideSections): State {
  if (!sections.named) return state
  return Object.fromEntries(Object.entries(state).map(([no, drawing]) => [sections.idOf(Number(no)) ?? no, drawing]))
}

/** Drawings by section id as a window receives them: by this deck's slide numbers, without the sections it does not have. */
export function drawingsIn(patch: State, sections: SlideSections): State {
  if (!sections.named) return patch
  return Object.fromEntries(Object.entries(patch).flatMap(([id, drawing]) => {
    const no = sections.noOf(id)
    return no === undefined ? [] : [[String(no), drawing]]
  }))
}
