import { componentErrors, createStore, PAGE_READINESS, presmiumService, STEP_CLOCK } from '@lincyaw/host'
import type { StepClock } from '@lincyaw/host'
import { CAPTURE_HOOK } from '@lincyaw/kernel'
import type { CaptureHook, IRDocument } from '@lincyaw/kernel'

interface ShownViewer {
  readonly doc: { getSnapshot(): IRDocument }
  show(position: { section: string, step: number }): void
}

const frame = () => new Promise<void>(done => requestAnimationFrame(() => done()))
const pause = (ms: number) => new Promise(done => setTimeout(done, ms))
const READINESS_MS = 30_000
const QUIET_MS = 100
const QUIET_CHECKS = 3

/**
 * Waits until the element is drawn: components load their code when first shown, and only then hold the page's
 * readiness, so the picture waits until nothing is pending and the element has not changed for a while (with the clock
 * held or at rest, a settled element stays still), then for the clock's work and the fonts.
 */
async function settled(selector: string): Promise<string[]> {
  const readiness = presmiumService(PAGE_READINESS)
  const until = Date.now() + READINESS_MS
  let before = '', still = 0
  while (still < QUIET_CHECKS && Date.now() < until) {
    await pause(QUIET_MS)
    const element = document.querySelector(selector)
    const now = `${element?.innerHTML.length ?? -1}:${element?.querySelectorAll('*').length ?? -1}`
    still = (readiness?.pending.getSnapshot() ?? 0) === 0 && now === before ? still + 1 : 0
    before = now
  }
  // A component that failed (a scene whose code could not be loaded) is drawn failed and said so; the picture is still taken.
  const failures: string[] = []
  await presmiumService(STEP_CLOCK)?.settled().catch((error: unknown) => { failures.push(error instanceof Error ? error.message : String(error)) })
  await document.fonts.ready
  await frame()
  await frame()
  return failures
}

const problems = (failures: string[] = []) => ({ problems: [...failures, ...componentErrors().map(error => `${error.component}: ${error.message}`)] })

/**
 * A page opened with `?capture` (by the workspace service's capturing browser) shows what it is asked for. A slide is
 * drawn at the moment asked for: the hook drives the step clock as a lecture export does, holding it so that no other
 * driver (the lecture player) takes it, and a component draws the same frame whenever it is asked. Reached backward,
 * the slide is left to the page's own clock, as a presenter going back sees it.
 */
export function installCaptureHook(viewer: ShownViewer): void {
  const elapsed = createStore<number | undefined>(Infinity)
  // The runtime starts again when plugins or viewers arrive, with a clock of its own: the current one is driven.
  let driven: { clock: StepClock, release(): void } | undefined
  const drive = (at: number | undefined) => {
    const clock = presmiumService(STEP_CLOCK)
    if (clock && driven?.clock !== clock) {
      driven?.release()
      driven = { clock, release: clock.drive({ elapsed, recording: true, exclusive: true }) }
    }
    elapsed.set(at ?? Infinity)
  }
  const release = () => {
    driven?.release()
    driven = undefined
  }
  const slide = (section: string) => `.pm-slide[data-section="${CSS.escape(section)}"]`
  const hook: CaptureHook = {
    async show({ section, step, at, arrive }) {
      if (arrive !== 'backward') {
        drive(at)
        viewer.show({ section, step })
        return problems(await settled(slide(section)))
      }
      release()
      const sections = viewer.doc.getSnapshot().sections
      const index = sections.findIndex(s => s.id === section)
      const later = step < (sections[index]?.steps ?? 0) ? { section, step: step + 1 } : sections[index + 1] ? { section: sections[index + 1]!.id, step: 0 } : undefined
      // The last step of the document has none after it: it is shown as it is reached, and said so.
      if (later) {
        viewer.show(later)
        await settled(slide(later.section))
      }
      viewer.show({ section, step })
      const shown = problems(await settled(slide(section)))
      return later ? shown : { problems: [`no step comes after step ${step} of ${section} to go back from; it is shown as reached directly`, ...shown.problems] }
    },
    async read(section) {
      drive(undefined)
      viewer.show({ section, step: 0 })
      const selector = `section.pm-section[data-section="${CSS.escape(section)}"]`
      await settled(selector)
      // Components below the fold load when they come near the window: the section is scrolled through once.
      const element = document.querySelector(selector)
      if (element) {
        const top = element.getBoundingClientRect().top + window.scrollY
        for (let y = top; y < top + element.getBoundingClientRect().height; y += window.innerHeight / 2) {
          window.scrollTo(0, y)
          await pause(QUIET_MS)
        }
      }
      // Back at the top, the page's sticky header covers none of the section in a picture of the whole page.
      window.scrollTo(0, 0)
      return problems(await settled(selector))
    },
  }
  Object.assign(window, { [CAPTURE_HOOK]: hook })
}
