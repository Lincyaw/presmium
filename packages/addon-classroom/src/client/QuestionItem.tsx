import { Fragment, useState, useRef, useEffect, useMemo, useId } from 'react'
import type { ReactNode } from 'react'
import { useMessages } from '@lincyaw/host'
import { MESSAGES } from '../domain/index.ts'
import type { Question } from '../domain/index.ts'
import type { AiAnswers } from './ai-answers.ts'
import './style.css'
import './QuestionItem.css'
export default function QuestionItem(
  props: {
    question: Question & { id: string }
    active: boolean
    ai: AiAnswers
  } & {
    children?: ReactNode
    className?: string
    onDone?(): void
    onCited?(): void
    onToggleAnswered?(): void
    onSend?(): void
  },
) {
  const { question, active, ai } = props

  const t = useMessages(MESSAGES)
  const draft = props.ai.drafts.get(props.question.id)

  return (
    <>
      <li className="pm-classroom-question" data-answered={question.answered ? '' : undefined}>
        <strong>{question.name}</strong>
        {t.colon}
        {question.text}
        {active ? (
          <button
            type="button"
            className="pm-ui-button pm-ui-button--small"
            onClick={(event) => {
              props.onToggleAnswered?.()
            }}
          >
            {question.answered ? t.questions.markUnanswered : t.questions.markAnswered}
          </button>
        ) : null}
        {active && ai.provider && !question.reply && !draft ? (
          <button
            type="button"
            className="pm-classroom-panel__ai pm-ui-button pm-ui-button--small"
            title={t.questions.aiTitle(ai.provider)}
            onClick={(event) => {
              ai.draftReply(question.id, question)
            }}
          >
            {t.questions.ai(ai.provider)}
          </button>
        ) : null}
        {draft ? (
          <div className="pm-classroom-panel__draft" data-state={draft.state}>
            {draft.state === 'running' ? (
              <p className="pm-classroom-status" role="status">
                {t.questions.aiAnswering}
              </p>
            ) : draft.state === 'ready' ? (
              <>
                <p className="pm-classroom-status">{t.questions.aiDraft}</p>
                <p className="pm-classroom-panel__answer">{draft.text}</p>
              </>
            ) : (
              <p className="pm-classroom-error" role="alert">
                {t.questions.aiFailed(draft.error ?? '')}
              </p>
            )}
            <p className="pm-classroom-actions">
              {draft.state === 'ready' ? (
                <button
                  type="button"
                  className="pm-ui-button pm-ui-button--primary pm-ui-button--small"
                  onClick={(event) => {
                    props.onSend?.()
                  }}
                >
                  {t.questions.send}
                </button>
              ) : null}
              <button
                type="button"
                className="pm-ui-button pm-ui-button--small"
                onClick={(event) => {
                  ai.discard(question.id)
                }}
              >
                {t.questions.discard}
              </button>
            </p>
          </div>
        ) : null}
        {question.reply ? (
          <p className="pm-classroom-reply">
            {question.reply.provider ? t.questions.reply(question.reply.provider) : ''}
            {question.reply.text}
          </p>
        ) : null}
      </li>
    </>
  )
}
