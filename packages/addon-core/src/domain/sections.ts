/**
 * Slides by section (D-4, F-85): the full and the student build number their
 * slides apart, while a section's id is the same in both. The core plugin's
 * pass `slide-sections` writes each section's id to its slide's frontmatter
 * under `presmiumId` (through `hints.slides`, which the slides renderer
 * copies there). The slides form reports a position's section by it, moves
 * to a section by it, and carries what Slidev synchronizes by slide number
 * (the page, the drawings) between windows by section, so a learner of the
 * student build follows a presenter of the full build to the same slide.
 */

/** The frontmatter key of a slide's section id. */
export const SECTION_KEY = 'presmiumId'

/** The section id a slide's frontmatter names. */
export function sectionOf(frontmatter: Record<string, unknown> | undefined): string | undefined {
  const id = frontmatter?.[SECTION_KEY]
  return typeof id === 'string' && id ? id : undefined
}

/** The slides of a deck and their sections. */
export interface SlideSections {
  /** Whether the slides name their sections (a deck compiled without the core plugin's pass names none). */
  readonly named: boolean
  idOf(no: number): string | undefined
  noOf(id: string): number | undefined
}

export function slideSections(slides: readonly { no: number, id?: string }[]): SlideSections {
  const ids = new Map<number, string>()
  const numbers = new Map<string, number>()
  for (const { no, id } of slides) {
    if (id === undefined) continue
    ids.set(no, id)
    if (!numbers.has(id)) numbers.set(id, no)
  }
  return { named: ids.size > 0, idOf: no => ids.get(no), noOf: id => numbers.get(id) }
}

type State = Readonly<Record<string, unknown>>

/** The fields of Slidev's shared state that belong to the page it names. */
const PAGE_FIELDS = ['page', 'clicks', 'clicksTotal', 'cursor']

/** Slidev's shared state (page, clicks, ...) as a window sends it: with its page's section. */
export function sharedOut(state: State, sections: SlideSections): State {
  const id = typeof state.page === 'number' ? sections.idOf(state.page) : undefined
  return id === undefined ? state : { ...state, [SECTION_KEY]: id }
}

/**
 * Slidev's shared state as a window receives it, patch by patch (a patch
 * holds the fields that changed): the page of the section the sender's page
 * has, in this deck's numbers; while the sender is in a section this deck
 * does not have (one for another audience), no page nor what belongs to it,
 * so the window stays where it is. A sender whose slides name no section is
 * followed by its numbers.
 */
export function sharedReceiver(sections: () => SlideSections): (patch: State) => State {
  let section: string | undefined
  return (patch) => {
    const { [SECTION_KEY]: id, ...rest } = patch
    if (SECTION_KEY in patch) section = typeof id === 'string' ? id : undefined
    const own = sections()
    if (section === undefined || !own.named) return rest
    const page = own.noOf(section)
    if (page === undefined) return Object.fromEntries(Object.entries(rest).filter(([key]) => !PAGE_FIELDS.includes(key)))
    return 'page' in rest || SECTION_KEY in patch ? { ...rest, page } : rest
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
