import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { PmButton, PmIconButton } from '../components.tsx'
import { useMessages, useWorkbench, useWorkbenchState } from '../context.tsx'
import type { Pointer } from '../workbench.ts'

type Step = 'tools' | 'comment'

const GAP = 10
const MARGIN = 8

/**
 * Where the popover goes in the stage: below the pointer (above it when there is no room), inside the stage. The
 * pointer is in the preview's viewport, which lies at `offset` in the stage (a slide sits on the canvas).
 */
function placement(pointer: Pointer, size: { width: number, height: number }, stage: { width: number, height: number }, offset: { x: number, y: number }) {
  const rect = { ...pointer.rect!, x: pointer.rect!.x + offset.x, y: pointer.rect!.y + offset.y }
  const point = pointer.point && { x: pointer.point.x + offset.x, y: pointer.point.y + offset.y }
  const x = pointer.quote ? rect.x : point?.x ?? rect.x
  const below = pointer.quote ? rect.y + rect.height : point?.y ?? rect.y + rect.height
  const above = pointer.quote ? rect.y : point?.y ?? rect.y
  let top = below + GAP
  if (top + size.height > stage.height - MARGIN && above - GAP - size.height >= MARGIN) top = above - GAP - size.height
  const left = Math.max(MARGIN, Math.min(x - 16, stage.width - size.width - MARGIN))
  return { left, top: Math.max(MARGIN, Math.min(top, stage.height - size.height - MARGIN)) }
}

/** A compact comment action beside the selected content, expanding into its comment form. */
export function PointerPopover() {
  const t = useMessages()
  const workbench = useWorkbench()
  const pointer = useWorkbenchState(state => state.pointer)
  const [step, setStep] = useState<Step>('tools')
  const [text, setText] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ left: number, top: number }>()
  const key = pointer && JSON.stringify([pointer.target, pointer.quote ?? ''])

  useEffect(() => {
    setStep('tools')
    setText('')
  }, [key])
  useLayoutEffect(() => {
    const element = box.current
    const stage = element?.parentElement
    if (!pointer?.rect || !element || !stage) return setPosition(undefined)
    const frame = stage.querySelector('.pmw-preview__frame')?.getBoundingClientRect()
    const origin = stage.getBoundingClientRect()
    const offset = frame ? { x: frame.left - origin.left, y: frame.top - origin.top } : { x: 0, y: 0 }
    setPosition(placement(pointer, { width: element.offsetWidth, height: element.offsetHeight }, { width: stage.clientWidth, height: stage.clientHeight }, offset))
  }, [pointer, step])
  useEffect(() => {
    if (!pointer) return
    const close = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) workbench.point(undefined)
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [pointer, workbench])

  if (!pointer?.rect) return null
  const submit = (event: FormEvent) => {
    event.preventDefault()
    workbench.addComment(text)
  }
  const keys = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) submit(event)
    if (event.key === 'Escape') {
      event.preventDefault()
      setStep('tools')
    }
  }
  return (
    <div ref={box} className="pmw-pointer pm-ui" role="dialog" aria-label={t.pointerTools} data-step={step} style={position ?? { visibility: 'hidden' }}>
      {step === 'tools'
        ? (
            <div className="pmw-pointer__tools" role="toolbar" aria-label={t.pointerTools}>
              <PmIconButton small icon="comment-add" label={t.newComment} onClick={() => setStep('comment')} />
            </div>
          )
        : (
            <form className="pmw-pointer__form" onSubmit={submit}>
              {pointer.quote && <blockquote className="pmw-pointer__quote">{pointer.quote}</blockquote>}
              <textarea
                className="pm-ui-textarea pmw-pointer__text"
                autoFocus
                rows={3}
                value={text}
                aria-label={t.newComment}
                placeholder={t.commentPlaceholder}
                onChange={event => setText(event.target.value)}
                onKeyDown={keys}
              />
              <div className="pmw-pointer__actions">
                <PmButton small onClick={() => setStep('tools')}>{t.cancel}</PmButton>
                <PmButton small type="submit" variant="primary" disabled={!text.trim()}>{t.postComment}</PmButton>
              </div>
            </form>
          )}
    </div>
  )
}
