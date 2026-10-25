import { Fragment, useState, useRef, useEffect, useMemo, useId } from 'react'
import type { ReactNode } from 'react'
import { useMessages } from '@lincyaw/host'
import {
  useClassroomStore,
  useCollection,
  useGuardedWrite,
  useParticipation,
} from '../src/client/composables.ts'
import { newId } from '../src/client/ids.ts'
import { COLLECTIONS, MESSAGES, placeText, toQuestion } from '../src/domain/index.ts'
import type { Place, Question } from '../src/domain/index.ts'
import '../src/client/style.css'
import './PmQuestionBox.css'
export default function PmQuestionBox(
  props: {
    target?: string
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
  const { target, place } = props

  const { me, status, joined, presenter } = useParticipation()
  const store = useClassroomStore()
  const questions = useCollection(() => store, COLLECTIONS.questions, toQuestion)
  const { failure, write } = useGuardedWrite()
  const [text, setText] = useState('')
  const t = useMessages(MESSAGES)

  const where = props.place ? placeText({ ...props.place, block: props.target }, t) : ''
  const here = questions
    .filter(({ value }) => value.section === props.place?.section && value.block === props.target)
    .sort((a, b) => a.value.at - b.value.at)
  const shown = presenter ? here : here.filter(({ value }) => value.participant === me?.id)
  const canAsk = joined && !presenter && status === 'active'

  function ask(): void {
    const participant = me
    const question = text.trim()
    if (!store || !participant || !props.place || !question) return
    const { section, title, index } = props.place
    const asked = write(() =>
      store!.put<Question>(COLLECTIONS.questions, `${participant.id}:${newId()}`, {
        section,
        ...(props.target ? { block: props.target } : {}),
        title,
        index,
        text: question,
        participant: participant.id,
        name: participant.name,
        at: Date.now(),
      }),
    )
    if (asked) setText('')
  }

  function toggleAnswered(id: string, question: Question): void {
    write(() =>
      store?.put<Question>(COLLECTIONS.questions, id, { ...question, answered: !question.answered }),
    )
  }

  return (
    <>
      <div className="pm-question-box pm-classroom-card" data-place={where}>
        <div className="pm-question-box__prompt">{props.children}</div>
        {canAsk ? (
          <form
            className="pm-question-box__form"
            onSubmit={(event) => {
              event.preventDefault()
              ask()
            }}
          >
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              className="pm-ui-textarea"
              aria-label={t.questions.question}
              rows={2}
              maxLength={500}
              placeholder={t.questions.placeholder}
              onKeyDown={(event) => {
                event.stopPropagation()
              }}
            ></textarea>
            <p className="pm-classroom-actions">
              <button
                type="submit"
                className="pm-ui-button pm-ui-button--primary pm-ui-button--small"
                disabled={!text.trim()}
              >
                {t.questions.ask}
              </button>
              <span className="pm-classroom-status">{t.questions.attachedTo(where)}</span>
            </p>
          </form>
        ) : !joined ? (
          <p className="pm-classroom-status">{t.questions.joinFirst}</p>
        ) : status !== 'active' ? (
          <p className="pm-classroom-status">{t.questions.ended}</p>
        ) : null}
        {shown.length ? (
          <ul className="pm-question-box__list" aria-label={presenter ? t.questions.here : t.questions.mine}>
            {shown.map((item) => (
              <li key={item.id} data-answered={item.value.answered ? '' : undefined}>
                {presenter ? (
                  <span className="pm-question-box__name">
                    {item.value.name}
                    {t.colon}
                  </span>
                ) : null}
                {item.value.text}
                {item.value.answered ? (
                  <span className="pm-question-box__answered pm-ui-badge pm-ui-badge--ok">
                    {t.questions.answered}
                  </span>
                ) : null}
                {item.value.reply ? (
                  <p className="pm-classroom-reply">
                    {item.value.reply.provider ? t.questions.reply(item.value.reply.provider) : ''}
                    {item.value.reply.text}
                  </p>
                ) : null}
                {presenter && status === 'active' ? (
                  <button
                    type="button"
                    className="pm-ui-button pm-ui-button--small"
                    onClick={(event) => {
                      toggleAnswered(item.id, item.value)
                    }}
                  >
                    {item.value.answered ? t.questions.markUnanswered : t.questions.markAnswered}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {failure ? (
          <p className="pm-classroom-error" role="alert">
            {failure}
          </p>
        ) : null}
      </div>
    </>
  )
}
