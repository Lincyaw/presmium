import type { IRDocument, ProductionPlan, ProductionTiming } from '@lincyaw/kernel'

/** One step of the lecture as its production plan times it. */
export interface StepTiming {
  sectionId: string
  /** The page's number in the document, from 1. */
  page: number
  pageTitle: string
  stepId: string
  /** The step's number on its page, from 1. */
  step: number
  /** The letters and digits of the step's script (`narrationCharacters`). */
  characters: number
  /** The step's sentences that have voiceover, synthesized or recorded. */
  voiceMs: number
  /** The longest animation that starts at the step, as declared. */
  animationMs?: number
  startMs?: number
  lengthMs?: number
}

export interface LectureTiming {
  timing: ProductionTiming
  durationMs?: number
  steps: StepTiming[]
  characters: number
  voiceMs: number
  /** Characters of script a second of voiceover, over the steps that have voiceover. */
  rate?: number
}

/** What a reader counts in a script: its letters and digits, without spaces and punctuation. */
export function narrationCharacters(text: string): number {
  return text.match(/[\p{L}\p{N}]/gu)?.length ?? 0
}

/** Per step of the plan: its script, its voiceover, its animation and its length. */
export function lectureTiming(doc: IRDocument, plan: Pick<ProductionPlan, 'timing' | 'durationMs' | 'pages' | 'tracks'>): LectureTiming {
  const voice = new Map<string, number>()
  for (const segment of plan.tracks.find(track => track.kind === 'voice')?.segments ?? []) {
    // Audio clips of the sequence are not voiceover.
    if (segment.mediaClipId || (segment.status !== 'cached' && segment.status !== 'recorded')) continue
    const ms = segment.audio?.durationMs ?? (segment.startMs !== undefined && segment.endMs !== undefined ? segment.endMs - segment.startMs : 0)
    voice.set(segment.stepId, (voice.get(segment.stepId) ?? 0) + ms)
  }
  const steps = plan.pages.flatMap((page) => {
    const section = doc.sections.find(section => section.id === page.sectionId)
    return page.steps.map((step): StepTiming => ({
      sectionId: page.sectionId,
      page: section?.index ?? 0,
      pageTitle: page.title,
      stepId: step.stepId,
      step: step.index + 1,
      characters: narrationCharacters((section?.stepNarrations?.[step.stepId] ?? []).map(line => line.text).join('')),
      voiceMs: voice.get(step.stepId) ?? 0,
      ...step.animationMs !== undefined ? { animationMs: step.animationMs } : {},
      ...step.startMs !== undefined ? { startMs: step.startMs } : {},
      ...step.startMs !== undefined && step.endMs !== undefined ? { lengthMs: step.endMs - step.startMs } : {},
    }))
  })
  const voiced = steps.filter(step => step.voiceMs > 0)
  const voiceMs = voiced.reduce((sum, step) => sum + step.voiceMs, 0)
  const rate = voiceMs > 0 ? voiced.reduce((sum, step) => sum + step.characters, 0) * 1000 / voiceMs : undefined
  return {
    timing: plan.timing,
    ...plan.durationMs !== undefined ? { durationMs: plan.durationMs } : {},
    steps,
    characters: steps.reduce((sum, step) => sum + step.characters, 0),
    voiceMs,
    ...rate !== undefined ? { rate } : {},
  }
}

/** How far the lecture runs over `limitMs`, and about how many characters of script to cut at its measured rate. */
export function overLimit(timing: LectureTiming, limitMs: number): { overMs: number, cut?: number } | undefined {
  if (timing.durationMs === undefined || timing.durationMs <= limitMs) return undefined
  const overMs = timing.durationMs - limitMs
  return { overMs, ...timing.rate ? { cut: Math.ceil(overMs / 1000 * timing.rate) } : {} }
}
