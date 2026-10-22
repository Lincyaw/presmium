export const CLASSROOM_ID = 'presmium.classroom'

export const COLLECTIONS = {
  quizzes: 'quizzes',
  answers: 'answers',
  submissions: 'submissions',
  questions: 'questions',
  pulse: 'pulse',
  predictions: 'predictions',
  notes: 'notes',
} as const

const STUDENT_AUDIENCE = 'student'

export function isForStudents(section: { audience?: readonly string[] }): boolean {
  return !section.audience?.length || section.audience.includes(STUDENT_AUDIENCE)
}

export type SectionNumbers = Readonly<Record<string, number>>

export function toSectionNumbers(config: Record<string, unknown> | undefined): SectionNumbers {
  const sections = config?.sections
  if (typeof sections !== 'object' || sections === null || Array.isArray(sections)) return {}
  return Object.fromEntries(Object.entries(sections).filter((entry): entry is [string, number] => Number.isInteger(entry[1])))
}
