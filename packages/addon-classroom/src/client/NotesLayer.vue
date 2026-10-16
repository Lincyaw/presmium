<script setup lang="ts">
// The notes of the web form (P-63): a note spot beside each section of the page views, and beside
// each labelled block in it. The IR runtime renders sections and blocks with stable markup
// (`.pm-section[data-section]`, `.pm-block[data-block]`) but offers nothing to add beside them, so
// the layer adds a slot of its own there and teleports a spot into it, following the page as it
// changes. The layer reads the notes once and gives each spot those of its place. A block's spot
// shows while the reader points at the block or focuses in it, while it is open and while the block
// has notes, so a section shows one notes button; it is named after the block's first words, not
// its label. Until then it is transparent, not hidden, so keyboard users reach it with Tab. The
// slides form has no such markup, and no notes.
import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue'
import { COLLECTIONS, isLabel, isNote, notesAt } from '../domain/index.ts'
import NoteSpot from './NoteSpot.vue'
import { useCollection, useNotes } from './use.ts'

interface Spot {
  key: string
  slot: HTMLElement
  section: string
  block?: string
  label: string
}

/** Characters of a block's text that name its notes. */
const LABEL_LENGTH = 20

const { store, inClassroom } = useNotes()
const notes = useCollection(() => store.value, COLLECTIONS.notes, isNote)
/** The notes of each place, by spot key. */
const byPlace = computed(() => {
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

/** The layer's slot in `parent`: added after `after`, or at the end, the first time. */
function slotIn(parent: HTMLElement, kind: 'section' | 'block', after?: Element | null): HTMLElement {
  const existing = [...parent.children].find(child => child.classList.contains('pm-note-slot'))
  if (existing) return existing as HTMLElement
  const slot = document.createElement('div')
  slot.className = `pm-note-slot pm-note-slot--${kind}`
  if (after) after.after(slot)
  else parent.append(slot)
  return slot
}

/** The first words of a block, without the layer's own slot (nor the comments Vue marks fragments with). */
function blockLabel(block: HTMLElement): string {
  const text = [...block.childNodes]
    .filter(node => node.nodeType === Node.TEXT_NODE || (node instanceof Element && !node.classList.contains('pm-note-slot')))
    .map(node => node.textContent ?? '').join(' ').replace(/\s+/g, ' ').trim()
  const chars = [...text]
  return chars.length > LABEL_LENGTH ? `${chars.slice(0, LABEL_LENGTH).join('')}…` : text
}

function scan(): void {
  frame = 0
  const found: Spot[] = []
  for (const section of document.querySelectorAll<HTMLElement>('.pm-view .pm-section[data-section]')) {
    const id = section.dataset.section!
    const title = section.querySelector(':scope > .pm-section__title')
    // The heading ends with an anchor link holding a zero-width space.
    const label = title?.textContent?.replace(/​/g, '').trim() || id
    found.push({ key: id, slot: slotIn(section, 'section', title), section: id, label })
    for (const block of section.querySelectorAll<HTMLElement>('.pm-block[data-block]')) {
      const blockId = block.dataset.block!
      // The blocks inside a component are not the section's.
      if (!isLabel(blockId) || block.parentElement?.closest('.pm-block')) continue
      found.push({ key: `${id}/${blockId}`, slot: slotIn(block, 'block'), section: id, block: blockId, label: blockLabel(block) || label })
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
      :notes="notesAt(byPlace.get(spot.key) ?? [], spot.section, spot.block)"
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
