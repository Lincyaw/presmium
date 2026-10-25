import { useMessages } from '@lincyaw/host'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { COLLECTIONS, isAuthorLabel, MESSAGES, notesAt, toNote } from '../domain/index.ts'
import { useCollection, useNoteStore } from './composables.ts'
import NoteSpot from './NoteSpot.tsx'
import './NotesLayer.css'
interface Spot {
  key: string
  slot: HTMLElement
  section: string
  block?: string
  label: string
}
export default function NotesLayer() {
  const t = useMessages(MESSAGES)
  const { store, inClassroom } = useNoteStore()
  const notes = useCollection(() => store, COLLECTIONS.notes, toNote)
  const [spots, setSpots] = useState<Spot[]>([])
  const current = useRef(spots)
  current.current = spots
  const notesBySpot = new Map<string, typeof notes>()
  for (const note of notes) {
    const key = note.value.block ? `${note.value.section}/${note.value.block}` : note.value.section
    notesBySpot.set(key, [...(notesBySpot.get(key) ?? []), note])
  }
  useEffect(() => {
    let frame = 0
    const slots = new Set<HTMLElement>()
    const slotIn = (parent: HTMLElement, kind: string, after?: Element | null) => {
      const existing = [...parent.children].find((c) => c.classList.contains('pm-note-slot'))
      if (existing) return existing as HTMLElement
      const slot = document.createElement('div')
      slot.className = `pm-note-slot pm-note-slot--${kind}`
      slots.add(slot)
      if (after) after.after(slot)
      else parent.append(slot)
      return slot
    }
    const scan = () => {
      frame = 0
      const found: Spot[] = []
      for (const section of document.querySelectorAll<HTMLElement>('.pm-view .pm-section[data-section]')) {
        const id = section.dataset.section!
        const title = section.querySelector(':scope > .pm-section__title')
        const label = title?.textContent?.replace(/​/g, '').trim() || id
        found.push({ key: id, slot: slotIn(section, 'section', title), section: id, label })
        for (const block of section.querySelectorAll<HTMLElement>('.pm-block[data-block]')) {
          const blockId = block.dataset.block!
          if (!isAuthorLabel(blockId) || block.parentElement?.closest('.pm-block')) continue
          const copy = block.cloneNode(true) as HTMLElement
          copy.querySelectorAll('table, pre, .pm-note-slot, .pm-content-marks').forEach((e) => e.remove())
          const text = (copy.textContent ?? '').replace(/\s+/g, ' ').trim()
          const kind = block.querySelector('table')
            ? 'table'
            : block.querySelector('pre')
              ? 'code'
              : undefined
          const description = text
            ? [...text].slice(0, 20).join('') + (text.length > 20 ? '…' : '')
            : kind
              ? t.notes.blockOf(label, t.notes.kinds[kind])
              : label
          found.push({
            key: `${id}/${blockId}`,
            slot: slotIn(block, 'block'),
            section: id,
            block: blockId,
            label: description,
          })
        }
      }
      const before = current.current
      if (
        found.length !== before.length ||
        found.some(
          (s, i) => s.key !== before[i]!.key || s.slot !== before[i]!.slot || s.label !== before[i]!.label,
        )
      ) {
        current.current = found
        setSpots(found)
      }
    }
    const observer = new MutationObserver(() => {
      frame ||= requestAnimationFrame(scan)
    })
    observer.observe(document.body, { childList: true, subtree: true })
    scan()
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      slots.forEach((slot) => slot.remove())
    }
  }, [t])
  return (
    <>
      {spots.map((spot) =>
        createPortal(
          <NoteSpot
            section={spot.section}
            block={spot.block}
            label={spot.label}
            notes={notesAt(notesBySpot.get(spot.key) ?? [], spot.section, spot.block)}
            store={store}
            inClassroom={inClassroom}
          />,
          spot.slot,
          spot.key,
        ),
      )}
    </>
  )
}
