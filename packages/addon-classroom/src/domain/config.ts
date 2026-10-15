/** Plugin id; also the owner of the classroom components in the IR. */
export const CLASSROOM_ID = 'presmium.classroom'

/** Collections of the `classroomStore` service that the classroom features use. */
export const COLLECTIONS = {
  quizzes: 'quizzes',
  answers: 'answers',
  submissions: 'submissions',
  questions: 'questions',
  pulse: 'pulse',
  /** In the participant's own store, or in the browser. */
  notes: 'notes',
} as const
