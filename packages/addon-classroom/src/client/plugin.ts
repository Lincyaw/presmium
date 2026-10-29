import { currentLocale, STATUS, TOOLBAR } from '@lincyaw/host'
import { CLASSROOM_STORE, EXECUTOR, PRESENTER_PANELS, SESSION } from '@lincyaw/kernel'
import type { ClassroomStore, PluginDefinition, Unsubscribe } from '@lincyaw/kernel'
import { version } from '../../package.json'
import { CLASSROOM_ID, classroomSummary, COLLECTIONS, MESSAGES, toAnswer, toPrediction, toPulseVote, toQuestion, toQuizState, toSectionNumbers, toSubmission } from '../domain/index.ts'
import type { ClassroomSummary } from '../domain/index.ts'
import ClassroomPanel from './ClassroomPanel.tsx'
import ClassroomToolbar from './ClassroomToolbar.tsx'

let cleanup: Unsubscribe[] = []

function records<T>(store: ClassroomStore | undefined, name: string, parse: (value: unknown) => T | undefined): (T & { id: string })[] {
  return (store?.list<unknown>(name) ?? []).flatMap(({ id, value }) => {
    const record = parse(value)
    return record === undefined ? [] : [{ ...record, id }]
  })
}

export const classroomPlugin: PluginDefinition = {
  manifest: {
    id: CLASSROOM_ID,
    name: { 'zh-CN': '课堂', en: 'Classroom' },
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
        questions: records(store, COLLECTIONS.questions, toQuestion),
        quizzes: records(store, COLLECTIONS.quizzes, toQuizState),
        answers: records(store, COLLECTIONS.answers, toAnswer),
        predictions: records(store, COLLECTIONS.predictions, toPrediction),
        votes: records(store, COLLECTIONS.pulse, toPulseVote),
        submissions: records(store, COLLECTIONS.submissions, toSubmission),
        numbers: toSectionNumbers(ctx.config),
      })
    }
    cleanup = [
      // The toolbar button also mounts the notes beside the sections, once per page (ClassroomOverlays).
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
