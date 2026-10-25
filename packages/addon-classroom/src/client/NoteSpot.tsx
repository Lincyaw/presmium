import { Fragment, useState, useRef, useEffect, useMemo, useId } from 'react'
import type { ReactNode } from 'react'
import { useMessages } from '@lincyaw/host'
import type { ClassroomStore, StoredItem } from '@lincyaw/kernel'
import { COLLECTIONS, MESSAGES } from '../domain/index.ts'
import type { Note } from '../domain/index.ts'
import { newId } from './ids.ts'
import './style.css'
import './NoteSpot.css'
export default function NoteSpot(
  props: {
    section: string
    block?: string
    label: string
    notes: StoredItem<Note>[]
    store: ClassroomStore
    inClassroom: boolean
  } & {
    children?: ReactNode
    className?: string
    onDone?(): void
    onCited?(): void
    onToggleAnswered?(): void
    onSend?(): void
  },
) {
  const { section, block, label, notes, store, inClassroom } = props

  const t = useMessages(MESSAGES)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')

  function add(): void {
    const note = text.trim()
    if (!note) return
    props.store.put<Note>(COLLECTIONS.notes, newId(), {
      section: props.section,
      ...(props.block ? { block: props.block } : {}),
      text: note,
      at: Date.now(),
    })
    setText('')
  }

  return (
    <>
      <div className="pm-note-spot" data-section={section} data-block={block} data-notes={notes.length}>
        <button
          type="button"
          className="pm-note-spot__toggle pm-ui-button pm-ui-button--ghost pm-ui-button--small"
          aria-expanded={open}
          aria-label={t.notes.label(label)}
          title={t.notes.label(label)}
          onClick={(event) => {
            setOpen(!open)
          }}
        >
          {t.notes.button}
          {notes.length ? (
            <span className="pm-note-spot__count pm-ui-badge pm-ui-badge--accent">{notes.length}</span>
          ) : null}
        </button>
        {open ? (
          <div className="pm-note-spot__panel">
            {notes.length ? (
              <ul className="pm-note-spot__list" aria-label={t.notes.mine}>
                {notes.map((note) => (
                  <li key={note.id}>
                    <span className="pm-note-spot__text">{note.value.text}</span>
                    <button
                      type="button"
                      className="pm-ui-button pm-ui-button--ghost pm-ui-button--small"
                      aria-label={t.notes.removeLabel(note.value.text)}
                      onClick={(event) => {
                        store.remove(COLLECTIONS.notes, note.id)
                      }}
                    >
                      {t.notes.remove}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <form
              onSubmit={(event) => {
                event.preventDefault()
                add()
              }}
            >
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                className="pm-ui-textarea"
                aria-label={t.notes.new}
                rows={2}
                maxLength={2000}
                onKeyDown={(event) => {
                  event.stopPropagation()
                }}
              ></textarea>
              <p className="pm-note-spot__actions">
                <button
                  type="submit"
                  className="pm-ui-button pm-ui-button--primary pm-ui-button--small"
                  disabled={!text.trim()}
                >
                  {t.notes.save}
                </button>
                <span className="pm-note-spot__where">
                  {inClassroom ? t.notes.inClassroom : t.notes.inBrowser}
                </span>
              </p>
            </form>
          </div>
        ) : null}
      </div>
    </>
  )
}
