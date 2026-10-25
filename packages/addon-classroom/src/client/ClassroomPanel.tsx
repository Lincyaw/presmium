import { Fragment, useState, useRef, useEffect, useMemo, useId } from 'react'
import type { ReactNode } from 'react'
import { useMessages, useSectionConfig } from '@lincyaw/host'
import {
  CLASSROOM_ID,
  classroomRows,
  COLLECTIONS,
  exerciseTallyText,
  MESSAGES,
  placeText,
  questionsByPlace,
  toAnswer,
  toPrediction,
  toPulseVote,
  toQuestion,
  toQuizState,
  toSectionNumbers,
  toSubmission,
  unansweredCount,
} from '../domain/index.ts'
import type { Question } from '../domain/index.ts'
import { useAiAnswers } from './ai-answers.ts'
import { useClassroomStore, useCollection, useGuardedWrite, useParticipation } from './composables.ts'
import QuestionItem from './QuestionItem.tsx'
import './style.css'
import './ClassroomPanel.css'
export default function ClassroomPanel(props: {
  children?: ReactNode
  className?: string
  onDone?(): void
  onCited?(): void
}) {
  const { status, presenter } = useParticipation()
  const store = useClassroomStore()
  const from = () => store
  const questions = useCollection(from, COLLECTIONS.questions, toQuestion)
  const votes = useCollection(from, COLLECTIONS.pulse, toPulseVote)
  const quizzes = useCollection(from, COLLECTIONS.quizzes, toQuizState)
  const answers = useCollection(from, COLLECTIONS.answers, toAnswer)
  const submissions = useCollection(from, COLLECTIONS.submissions, toSubmission)
  const predictions = useCollection(from, COLLECTIONS.predictions, toPrediction)
  const { failure, write } = useGuardedWrite()
  const t = useMessages(MESSAGES)
  const ai = useAiAnswers()

  const config = useSectionConfig(CLASSROOM_ID)
  const numbers = toSectionNumbers(config)

  const questionGroups = questionsByPlace(
    questions.map(({ id, value }) => ({ ...value, id })),
    t,
    numbers,
  )
  const unanswered = unansweredCount(questions.map((item) => item.value))

  const rows = classroomRows({
    quizzes: quizzes.map(({ id, value }) => ({ ...value, id })),
    answers: answers.map((item) => item.value),
    predictions: predictions.map((item) => item.value),
    votes: votes.map((item) => item.value),
    submissions: submissions.map((item) => item.value),
    numbers: numbers,
  })

  const pulses = rows.pulse.map((row) => ({
    id: row.id,
    place: placeText(row, t),
    levels: row.levels.map((level, i) => `${level} ${t.people(row.counts[i]!)}`).join(t.panel.levels),
  }))

  const quizRows = rows.quizzes.map((row) => ({
    id: row.id,
    text: t.panel.quiz(placeText(row, t), row.open, row.tally.respondents, row.tally.correct),
  }))

  const predicted = rows.predictions.map((row) => ({
    id: row.id,
    place: t.panel.predicted(placeText(row, t), row.tally.respondents),
    question: row.question,
    choices: (row.choices ?? []).map((choice, i) => ({ choice, count: row.tally.counts[i]! })),
    texts: row.tally.texts,
  }))

  const exercises = rows.exercises.map((row) => ({
    id: row.id,
    text: t.panel.exercise(placeText(row, t), exerciseTallyText(row.tally, t)),
  }))

  function toggleAnswered(question: Question & { id: string }): void {
    const { id, ...value } = question
    write(() => store?.put<Question>(COLLECTIONS.questions, id, { ...value, answered: !value.answered }))
  }

  function sendReply(question: Question & { id: string }): void {
    const draft = ai.drafts.get(question.id)
    if (draft?.state !== 'ready') return
    const { id, ...value } = question
    const sent = write(() =>
      store?.put<Question>(COLLECTIONS.questions, id, {
        ...value,
        answered: true,
        reply: { text: draft.text, ...(draft.provider ? { provider: draft.provider } : {}), at: Date.now() },
      }),
    )
    if (sent) ai.discard(id)
  }

  return (
    <>
      <div className="pm-classroom-panel">
        {!presenter ? (
          <p className="pm-classroom-status">{t.panel.waiting}</p>
        ) : (
          <>
            <section aria-label={t.panel.questions}>
              <h4 className="pm-ui-heading">{t.panel.unanswered(unanswered)}</h4>
              {!questionGroups.length ? (
                <p className="pm-classroom-status">{t.panel.none}</p>
              ) : status === 'active' && ai.offered && !ai.provider ? (
                <p className="pm-classroom-status pm-classroom-panel__ai-setup">{t.questions.aiSetup}</p>
              ) : null}
              {questionGroups.map((group) => (
                <div
                  key={group.label}
                  className="pm-classroom-panel__place"
                  data-section={group.section}
                  data-block={group.block}
                >
                  <p className="pm-classroom-panel__where">{group.label}</p>
                  <ul>
                    {group.questions.map((q) => (
                      <QuestionItem
                        key={q.id}
                        question={q}
                        active={status === 'active'}
                        ai={ai}
                        onToggleAnswered={() => {
                          toggleAnswered(q)
                        }}
                        onSend={() => {
                          sendReply(q)
                        }}
                      ></QuestionItem>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
            {pulses.length ? (
              <section aria-label={t.panel.pulse}>
                <h4 className="pm-ui-heading">{t.panel.pulse}</h4>
                {pulses.map((pulse) => (
                  <div key={pulse.id} className="pm-classroom-panel__place" data-pulse={pulse.id}>
                    <p className="pm-classroom-panel__where">{pulse.place}</p>
                    <p className="pm-classroom-panel__levels">{pulse.levels}</p>
                  </div>
                ))}
              </section>
            ) : null}
            {quizRows.length ? (
              <section aria-label={t.panel.quizzes}>
                <h4 className="pm-ui-heading">{t.panel.quizzes}</h4>
                {quizRows.map((quiz) => (
                  <p key={quiz.id} className="pm-classroom-panel__place" data-quiz={quiz.id}>
                    {quiz.text}
                  </p>
                ))}
              </section>
            ) : null}
            {predicted.length ? (
              <section aria-label={t.panel.predictions}>
                <h4 className="pm-ui-heading">{t.panel.predictions}</h4>
                {predicted.map((item) => (
                  <div key={item.id} className="pm-classroom-panel__place" data-predict={item.id}>
                    <p className="pm-classroom-panel__where">{item.place}</p>
                    <p>{item.question}</p>
                    <ul>
                      {item.choices.map(({ choice, count }, i) => (
                        <li key={i} data-choice={choice} data-count={count}>
                          {choice}
                          {t.colon}
                          {t.people(count)}
                        </li>
                      ))}
                      {item.texts.map((text, i) => (
                        <li key={i}>{text}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            ) : null}
            {exercises.length ? (
              <section aria-label={t.panel.exercises}>
                <h4 className="pm-ui-heading">{t.panel.exercises}</h4>
                {exercises.map((exercise) => (
                  <p key={exercise.id} className="pm-classroom-panel__place" data-exercise={exercise.id}>
                    {exercise.text}
                  </p>
                ))}
              </section>
            ) : null}
          </>
        )}
        {failure ? (
          <p className="pm-classroom-error" role="alert">
            {failure}
          </p>
        ) : null}
      </div>
    </>
  )
}
