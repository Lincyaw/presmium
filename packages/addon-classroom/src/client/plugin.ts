import { currentLocale, STATUS, TOOLBAR } from '@presmium/host'
import { CLASSROOM_STORE, EXECUTOR, PRESENTER_PANELS, SESSION } from '@presmium/kernel'
import type { ClassroomStore, PluginDefinition, Unsubscribe } from '@presmium/kernel'
import { version } from '../../package.json'
import { CLASSROOM_ID, classroomSummary, COLLECTIONS, isAnswer, isPrediction, isPulseVote, isQuestion, isQuizState, isSubmission, MESSAGES, sectionNumbers } from '../domain/index.ts'
import type { ClassroomSummary } from '../domain/index.ts'
import ClassroomPanel from './ClassroomPanel.vue'
import ClassroomToolbar from './ClassroomToolbar.vue'

let cleanup: Unsubscribe[] = []

/** The values of a collection that have the shape `valid` checks. */
function values<T>(store: ClassroomStore | undefined, name: string, valid: (value: unknown) => value is T): (T & { id: string })[] {
  return (store?.list<unknown>(name) ?? []).flatMap(({ id, value }) => (valid(value) ? [{ ...value, id }] : []))
}

/**
 * Classroom features (P-63 to P-68), registered by `setup/main.ts` in the
 * slides form and by the web renderer in the web form. The components
 * (`components/`) work over the `session` and `classroomStore` services and
 * check exercises with the `executor` service; without a session they work
 * alone (self-test quizzes, exercises, notes and predictions in the browser).
 * The plugin adds the presenter's overview to the presenter panels and the
 * toolbar, the notes beside the sections of the web form, and the classroom's
 * summary to the host's `STATUS`, which the page reports to a Presmium server
 * (for the MCP tool `get_classroom`): counts only, no learner's identity.
 */
export const classroomPlugin: PluginDefinition = {
  manifest: {
    id: CLASSROOM_ID,
    version,
    kernel: '^1.0.0',
    requires: [SESSION, CLASSROOM_STORE, EXECUTOR, TOOLBAR, PRESENTER_PANELS, STATUS].map(token => ({ token, optional: true })),
  },
  setup(ctx) {
    const title = MESSAGES[currentLocale()].interaction
    const summary = (): ClassroomSummary => {
      const store = ctx.tryGet(CLASSROOM_STORE)
      const snapshot = ctx.tryGet(SESSION)?.snapshot()
      return classroomSummary({
        status: snapshot?.status ?? 'idle',
        participants: snapshot?.participants ?? [],
        questions: values(store, COLLECTIONS.questions, isQuestion),
        quizzes: values(store, COLLECTIONS.quizzes, isQuizState),
        answers: values(store, COLLECTIONS.answers, isAnswer),
        predictions: values(store, COLLECTIONS.predictions, isPrediction),
        votes: values(store, COLLECTIONS.pulse, isPulseVote),
        submissions: values(store, COLLECTIONS.submissions, isSubmission),
        numbers: sectionNumbers(ctx.config),
      })
    }
    cleanup = [
      ctx.tryGet(TOOLBAR)?.register({ id: CLASSROOM_ID, title, component: ClassroomToolbar, order: 20 }),
      ctx.tryGet(PRESENTER_PANELS)?.register({ id: CLASSROOM_ID, title, component: ClassroomPanel, order: 20 }),
      ctx.tryGet(STATUS)?.register({ id: CLASSROOM_ID, read: summary }),
    ].filter(stop => stop !== undefined)
  },
  dispose() {
    cleanup.forEach(stop => stop())
    cleanup = []
  },
}

export default classroomPlugin
