import {
  Children as ReactChildren,
  isValidElement,
  Fragment,
  useState,
  useRef,
  useEffect,
  useMemo,
  useId,
} from 'react'
import type { ReactNode } from 'react'
import { useMessages, useViewRole } from '@lincyaw/host'
import { browserStore } from '../src/client/browser-store.ts'
import {
  useClassroomStore,
  useCollection,
  useGuardedWrite,
  useParticipation,
} from '../src/client/composables.ts'
import {
  COLLECTIONS,
  MESSAGES,
  placeKey,
  predictionId,
  toPrediction,
  toSavedPrediction,
} from '../src/domain/index.ts'
import type { Place, Prediction, SavedPrediction } from '../src/domain/index.ts'
import '../src/client/style.css'
import './PmPredict.css'
export default function PmPredict(
  props: {
    question: string
    choices?: string[]
    reveal?: string[]
    notes?: string[]
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
  const { question, choices, reveal, place } = props

  const role = useViewRole()
  const { me, status, joined, presenter } = useParticipation()
  const store = useClassroomStore()
  const kept = useCollection(browserStore, COLLECTIONS.predictions, toSavedPrediction)
  const predictions = useCollection(() => store, COLLECTIONS.predictions, toPrediction)
  const { failure, write } = useGuardedWrite()
  const t = useMessages(MESSAGES)
  const name = useId()

  const id = props.place ? placeKey(props.place) : ''
  const saved = kept.find((item) => item.id === id)?.value
  const sent = me !== undefined && predictions.some((item) => item.id === predictionId(id, me!.id))
  const held = role === 'reader' && !saved

  const [choice, setChoice] = useState<number>()
  const [text, setText] = useState('')
  const ready = props.choices ? choice !== undefined : text.trim() !== ''
  useEffect(() => {
    if (saved) {
      setChoice(saved.choice)
      setText(saved.text ?? '')
    }
  }, [saved])
  const savedText = (saved?.choice !== undefined ? props.choices?.[saved.choice] : saved?.text) ?? ''

  function save(): void {
    if (!ready || saved || !id) return
    const prediction: SavedPrediction = props.choices
      ? { choice: choice!, at: Date.now() }
      : { text: text.trim(), at: Date.now() }
    browserStore().put<SavedPrediction>(COLLECTIONS.predictions, id, prediction)
    const participant = me
    if (!store || !participant || !props.place || !joined || presenter || status !== 'active') return
    write(() =>
      store!.put<Prediction>(COLLECTIONS.predictions, predictionId(id, participant.id), {
        ...props.place!,
        predictId: id,
        participant: participant.id,
        question: props.question,
        ...(props.choices ? { choices: props.choices } : {}),
        ...prediction,
      }),
    )
  }

  function children(part: 'prompt' | 'reveal'): ReactNode[] {
    const nodes = ReactChildren.toArray(props.children)
    const notes = props.notes ?? []
    const ids = [...(props.reveal ?? []), ...notes]
    const idOf = (node: ReactNode) =>
      isValidElement<{ block?: { id: string } }>(node)
        ? (node.props.block?.id ?? String(node.key).replace(/^\.\$/, ''))
        : ''
    const revealed = (node: ReactNode) => ids.includes(idOf(node))
    if (ids.length > 0 && !nodes.some(revealed)) return part === 'reveal' ? nodes : []
    if (part === 'prompt') return nodes.filter((node) => !revealed(node))
    return nodes.filter((node) => revealed(node) && (role === 'reader' || !notes.includes(idOf(node))))
  }

  return (
    <>
      <div className="pm-predict pm-classroom-card" data-predict={id} data-state={saved ? 'saved' : 'open'}>
        <p className="pm-predict__question">{question}</p>
        {children('prompt')}
        <form
          className="pm-predict__form"
          onSubmit={(event) => {
            event.preventDefault()
            save()
          }}
          onKeyDown={(event) => {
            event.stopPropagation()
          }}
        >
          {choices ? (
            <fieldset className="pm-predict__choices" disabled={saved !== undefined}>
              <legend>{t.predict.yours}</legend>
              {choices.map((item, i) => (
                <label key={i}>
                  <input
                    checked={choice === i}
                    onChange={() => setChoice(i)}
                    className="pm-ui-checkbox"
                    type="radio"
                    name={name}
                    value={i}
                  ></input>
                  <span>{item}</span>
                </label>
              ))}
            </fieldset>
          ) : (
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              className="pm-ui-textarea"
              aria-label={t.predict.yours}
              placeholder={t.predict.placeholder}
              rows={2}
              maxLength={500}
              disabled={saved !== undefined}
            ></textarea>
          )}
          {!saved ? (
            <p className="pm-classroom-actions">
              <button
                type="submit"
                className="pm-ui-button pm-ui-button--primary pm-ui-button--small"
                disabled={!ready}
              >
                {t.predict.save}
              </button>
            </p>
          ) : null}
        </form>
        {saved ? (
          <p className="pm-classroom-status" role="status">
            {t.predict.saved(savedText)}
            {t.list}
            {sent ? t.predict.sent : t.predict.kept}
          </p>
        ) : held ? (
          <p className="pm-classroom-status">{t.predict.hidden}</p>
        ) : null}
        {!held ? <div className="pm-predict__reveal">{children('reveal')}</div> : null}
        {failure ? (
          <p className="pm-classroom-error" role="alert">
            {failure}
          </p>
        ) : null}
      </div>
    </>
  )
}
