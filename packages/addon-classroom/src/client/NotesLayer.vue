<script setup lang="ts">
import { useMessages } from '@lincyaw/host'
import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue'
import { COLLECTIONS, isAuthorLabel, MESSAGES, notesAt, toNote } from '../domain/index.ts'
import { useCollection, useNoteStore } from './composables.ts'
import NoteSpot from './NoteSpot.vue'

interface Spot {
  key: string
  slot: HTMLElement
  section: string
  block?: string
  label: string
}

const LABEL_LENGTH = 20

const t = useMessages(MESSAGES)
const { store, inClassroom } = useNoteStore()
const notes = useCollection(() => store.value, COLLECTIONS.notes, toNote)
const notesBySpot = computed(() => {
  const places = new Map<string, typeof notes.value>()
  for (const note of notes.value) {
    const key = note.value.block ? `${note.value.section}/${note.value.block}` : note.value.section
    places.set(key, [...places.get(key) ?? [], note])
  }
  return places
})
const spots = shallowRef<Spot[]>([])
let observer: MutationObserver | undefined
let frame = 0

function slotIn(parent: HTMLElement, kind: 'section' | 'block', after?: Element | null): HTMLElement {
  const existing = [...parent.children].find(child => child.classList.contains('pm-note-slot'))
  if (existing) return existing as HTMLElement
  const slot = document.createElement('div')
  slot.className = `pm-note-slot pm-note-slot--${kind}`
  if (after) after.after(slot)
  else parent.append(slot)
  return slot
}

const KINDS = [['table', 'table'], ['pre', 'code']] as const

function blockLabel(block: HTMLElement, section: string): string {
  const copy = block.cloneNode(true) as HTMLElement
  copy.querySelectorAll(`${KINDS.map(([selector]) => selector).join(', ')}, .pm-note-slot`).forEach(element => element.remove())
  const text = [...copy.childNodes]
    .filter(node => node.nodeType === Node.TEXT_NODE || node instanceof Element)
    .map(node => node.textContent ?? '').join(' ').replace(/\s+/g, ' ').trim()
  const chars = [...text]
  if (chars.length > 0) return chars.length > LABEL_LENGTH ? `${chars.slice(0, LABEL_LENGTH).join('')}…` : text
  const kind = KINDS.find(([selector]) => block.querySelector(selector))?.[1]
  return kind ? t.value.notes.blockOf(section, t.value.notes.kinds[kind]) : section
}

function scan(): void {
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
      found.push({ key: `${id}/${blockId}`, slot: slotIn(block, 'block'), section: id, block: blockId, label: blockLabel(block, label) })
    }
  }
  const before = spots.value
  if (found.length !== before.length || found.some((spot, i) => spot.key !== before[i]!.key || spot.slot !== before[i]!.slot || spot.label !== before[i]!.label)) spots.value = found
}

onMounted(() => {
  observer = new MutationObserver(() => {
    frame ||= requestAnimationFrame(scan)
  })
  observer.observe(document.body, { childList: true, subtree: true })
  scan()
})

onBeforeUnmount(() => {
  observer?.disconnect()
  cancelAnimationFrame(frame)
})
</script>

<template>
  <Teleport v-for="spot in spots" :key="spot.key" :to="spot.slot">
    <NoteSpot
      :section="spot.section"
      :block="spot.block"
      :label="spot.label"
      :notes="notesAt(notesBySpot.get(spot.key) ?? [], spot.section, spot.block)"
      :store="store"
      :in-classroom="inClassroom"
    />
  </Teleport>
</template>

<style>
.pm-note-slot--section {
  margin: -0.5rem 0 0.5rem;
}
.pm-note-slot--block {
  margin: 0.15rem 0 0.4rem;
}
.pm-block:not(:hover, :focus-within, :has(> .pm-note-slot :is([aria-expanded='true'], [data-notes]:not([data-notes='0'])))) > .pm-note-slot--block {
  opacity: 0;
}
</style>
