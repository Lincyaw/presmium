/** Plugin id; also the owner of the classroom components in the IR. */
export const CLASSROOM_ID = 'presmium.classroom'

/** Collections of the `classroomStore` service that the classroom features use. */
export const COLLECTIONS = {
  quizzes: 'quizzes',
  answers: 'answers',
  submissions: 'submissions',
  questions: 'questions',
  pulse: 'pulse',
  /** In a classroom; this browser keeps the reader's own predictions in its store, by the predict's id. */
  predictions: 'predictions',
  /** In the browser, and in the participant's own store while a classroom is active. */
  notes: 'notes',
} as const
