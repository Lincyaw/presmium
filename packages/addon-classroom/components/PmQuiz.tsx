import { Fragment, useState, useRef, useEffect, useMemo, useId } from 'react'
import type { ReactNode } from 'react'
import { useMessages } from '@lincyaw/host'
import {
  useClassroomStore,
  useCollection,
  useGuardedWrite,
  useParticipation,
} from '../src/client/composables.ts'
import {
  acceptsAnswers,
  answerId,
  COLLECTIONS,
  countedAnswers,
  isCorrect,
  lateAnswers,
  MESSAGES,
  optionLetter,
  placeKey,
  quizSwitched,
  quizTally,
  toAnswer,
  toQuizState,
} from '../src/domain/index.ts'
import type { Answer, Place, QuizState } from '../src/domain/index.ts'
import '../src/client/style.css'
import './PmQuiz.css'
export default function PmQuiz(
  props: {
    options: string[]
    correct: number[]
    place?: Place
  } & {
    children?: ReactNode
    className?: string
    onDone?(): void
    onCited?(): void
    onToggleAnswered?(): void
    onSend?(): void
  },
) {
  const { options, correct, place } = props

  const { me, status, joined, presenter } = useParticipation()
  const store = useClassroomStore()
  const quizzes = useCollection(() => store, COLLECTIONS.quizzes, toQuizState)
  const answers = useCollection(() => store, COLLECTIONS.answers, toAnswer)
  const { failure, write } = useGuardedWrite()
  const t = useMessages(MESSAGES)
  const name = useId()

  const id = props.place ? placeKey(props.place) : ''
  const state = quizzes.find((item) => item.id === id)?.value
  const counted = countedAnswers(
    id,
    state,
    answers.map((item) => item.value),
  )
  const late = lateAnswers(
    id,
    state,
    answers.map((item) => item.value),
  )
  const result = quizTally(props.options.length, props.correct, counted)
  const multiple = props.correct.length > 1
  const open = acceptsAnswers(status, state)
  const closed = state?.open === false
  const submitted = me ? answers.find((item) => item.id === answerId(id, me!.id))?.value : undefined
  const mine = closed ? counted.find((a) => a.participant === me?.id) : submitted

  const [choice, setChoice] = useState<number[]>([])
  const [tried, setTried] = useState<number[]>()
  useEffect(() => {
    if (mine && (closed || choice.length === 0)) setChoice([...mine.choice])
  }, [mine, closed])

  const canAnswer = joined ? !presenter && open : true
  const showTally = joined && (presenter || closed)
  const revealed = joined ? closed : tried !== undefined
  const letters = (choice: number[]) => choice.map(optionLetter).join(t.quiz.letters)

  const statusText = (() => {
    const { quiz } = t
    if (!joined) {
      if (!tried) return quiz.selfTest
      return isCorrect(tried, props.correct) ? quiz.right : quiz.wrong(letters(props.correct))
    }
    if (presenter)
      return open ? quiz.answering : closed ? quiz.closed : status === 'active' ? quiz.notOpen : quiz.ended
    if (closed) {
      const verdict = mine ? quiz.yours(isCorrect(mine.choice, props.correct)) : ''
      return `${quiz.closed}${verdict}${late.some((a) => a.participant === me?.id) ? quiz.lateMine : ''}`
    }
    if (status !== 'active') return quiz.ended
    if (!open) return quiz.waiting
    return submitted ? quiz.submitted(letters(submitted.choice)) : quiz.open
  })()

  function toggle(i: number): void {
    if (!multiple) setChoice([i])
    else setChoice(choice.includes(i) ? choice.filter((c) => c !== i) : [...choice, i].sort((a, b) => a - b))
  }

  function submit(): void {
    if (!joined) {
      setTried([...choice])
      return
    }
    const participant = me
    if (!store || !participant || !canAnswer) return
    write(() =>
      store!.put<Answer>(COLLECTIONS.answers, answerId(id, participant.id), {
        quizId: id,
        participant: participant.id,
        name: participant.name,
        choice: choice,
        at: Date.now(),
      }),
    )
  }

  function setOpen(next: boolean): void {
    if (!store || !props.place) return
    const quiz = { ...props.place, options: props.options, correct: props.correct, openedAt: state?.openedAt }
    write(() => store!.put<QuizState>(COLLECTIONS.quizzes, id, quizSwitched(quiz, next, counted, Date.now())))
  }

  return (
    <>
      <div
        className="pm-quiz pm-classroom-card"
        data-quiz={id}
        data-state={open ? 'open' : closed ? 'closed' : 'waiting'}
      >
        <div className="pm-quiz__prompt">{props.children}</div>
        <form
          className="pm-quiz__form"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <ol className="pm-quiz__options">
            {options.map((option, i) => (
              <li
                key={i}
                className="pm-quiz__option"
                data-option={optionLetter(i)}
                data-correct={revealed && correct.includes(i) ? '' : undefined}
              >
                <label>
                  <input
                    className="pm-ui-checkbox"
                    type={multiple ? 'checkbox' : 'radio'}
                    name={name}
                    checked={choice.includes(i)}
                    disabled={!canAnswer}
                    onChange={(event) => {
                      toggle(i)
                    }}
                  ></input>
                  <span className="pm-quiz__letter">{optionLetter(i)}</span>
                  <span>{option}</span>
                </label>
                {showTally ? <span className="pm-quiz__count">{t.people(result.counts[i]!)}</span> : null}
              </li>
            ))}
          </ol>
          <p className="pm-classroom-actions">
            {!presenter ? (
              <button
                type="submit"
                className="pm-ui-button pm-ui-button--primary pm-ui-button--small"
                disabled={!canAnswer || choice.length === 0}
              >
                {t.quiz.submit}
              </button>
            ) : null}
            {presenter && status === 'active' ? (
              <>
                {!open ? (
                  <button
                    type="button"
                    className="pm-ui-button pm-ui-button--primary pm-ui-button--small"
                    onClick={(event) => {
                      setOpen(true)
                    }}
                  >
                    {t.quiz.openButton}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="pm-ui-button pm-ui-button--small"
                    onClick={(event) => {
                      setOpen(false)
                    }}
                  >
                    {t.quiz.closeButton}
                  </button>
                )}
              </>
            ) : null}
          </p>
        </form>
        <p className="pm-classroom-status" role="status">
          {statusText}
        </p>
        {showTally ? (
          <p className="pm-quiz__tally">{t.quiz.tally(result.respondents, result.correct)}</p>
        ) : null}
        {presenter && late.length ? <p className="pm-quiz__late">{t.quiz.late(late.length)}</p> : null}
        {failure ? (
          <p className="pm-classroom-error" role="alert">
            {failure}
          </p>
        ) : null}
      </div>
    </>
  )
}
