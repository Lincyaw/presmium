import { Fragment, useState, useRef, useEffect, useMemo, useId } from 'react'
import type { ReactNode } from 'react'
import { useMessages } from '@lincyaw/host'
import {
  useClassroomStore,
  useCollection,
  useGuardedWrite,
  useParticipation,
} from '../src/client/composables.ts'
import { COLLECTIONS, MESSAGES, placeKey, pulseTally, toPulseVote, voteId } from '../src/domain/index.ts'
import type { Place, PulseVote } from '../src/domain/index.ts'
import '../src/client/style.css'
import './PmPulse.css'
export default function PmPulse(
  props: {
    question?: string
    levels?: string[]
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
  const { place } = props

  const { me, status, joined, presenter } = useParticipation()
  const store = useClassroomStore()
  const votes = useCollection(() => store, COLLECTIONS.pulse, toPulseVote)
  const { failure, write } = useGuardedWrite()
  const t = useMessages(MESSAGES)
  const question = props.question ?? t.pulse.question
  const levels = props.levels ?? t.pulse.levels

  const id = props.place ? placeKey(props.place) : ''
  const counts = pulseTally(
    id,
    levels.length,
    votes.map((item) => item.value),
  )
  const total = counts.reduce((sum, n) => sum + n, 0)
  const mine = me ? votes.find((item) => item.id === voteId(id, me!.id))?.value : undefined
  const canVote = joined && !presenter && status === 'active'

  function vote(level: number): void {
    const participant = me
    if (!store || !participant || !props.place) return
    write(() =>
      store!.put<PulseVote>(COLLECTIONS.pulse, voteId(id, participant.id), {
        ...props.place!,
        pulseId: id,
        participant: participant.id,
        level,
        levels: levels,
        at: Date.now(),
      }),
    )
  }

  return (
    <>
      <div className="pm-pulse pm-classroom-card" data-pulse={id}>
        <p className="pm-pulse__question">{question}</p>
        {props.children}
        {canVote ? (
          <p className="pm-classroom-actions" role="group" aria-label={question}>
            {levels.map((level, i) => (
              <button
                key={i}
                type="button"
                className="pm-ui-button pm-ui-button--small"
                aria-pressed={mine?.level === i}
                onClick={(event) => {
                  vote(i)
                }}
              >
                {level}
              </button>
            ))}
          </p>
        ) : !joined ? (
          <p className="pm-classroom-status">{t.pulse.joinFirst}</p>
        ) : null}
        {presenter ? (
          <ul className="pm-pulse__distribution" aria-label={t.pulse.distribution}>
            {levels.map((level, i) => (
              <li key={i} data-level={level} data-count={counts[i]}>
                <span className="pm-pulse__label">{level}</span>
                <span
                  className="pm-pulse__bar"
                  style={{ width: `${total ? (counts[i]! / total) * 100 : 0}%` }}
                ></span>
                <span className="pm-pulse__count">{t.people(counts[i]!)}</span>
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
