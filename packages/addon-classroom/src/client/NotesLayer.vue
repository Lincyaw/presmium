<script setup lang="ts">
// The notes of the web form (P-63): a note spot beside each section of the page views, and beside
// each labelled block in it. The IR runtime renders sections and blocks with stable markup
// (`.pm-section[data-section]`, `.pm-block[data-block]`) but offers nothing to add beside them, so
// the layer adds a slot of its own there and teleports a spot into it, following the page as it
// changes. The slides form has no such markup, and no notes.
import { onBeforeUnmount, onMounted, shallowRef } from 'vue'
import { isLabel } from '../domain/index.ts'
import NoteSpot from './NoteSpot.vue'

interface Spot {
  key: string
  slot: HTMLElement
  section: string
  block?: string
  label: string
}

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

function scan(): void {
  frame = 0
  const found: Spot[] = []
  for (const section of document.querySelectorAll<HTMLElement>('.pm-view .pm-section[data-section]')) {
    const id = section.dataset.section!
    const title = section.querySelector(':scope > .pm-section__title')
    // The heading ends with an anchor link holding a zero-width space.
    found.push({ key: id, slot: slotIn(section, 'section', title), section: id, label: title?.textContent?.replace(/​/g, '').trim() || id })
    for (const block of section.querySelectorAll<HTMLElement>('.pm-block[data-block]')) {
      const blockId = block.dataset.block!
      // The blocks inside a component are not the section's.
      if (!isLabel(blockId) || block.parentElement?.closest('.pm-block')) continue
      found.push({ key: `${id}/${blockId}`, slot: slotIn(block, 'block'), section: id, block: blockId, label: blockId })
    }
  }
  const before = spots.value
  if (found.length !== before.length || found.some((spot, i) => spot.key !== before[i]!.key || spot.slot !== before[i]!.slot)) spots.value = found
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
    <NoteSpot :section="spot.section" :block="spot.block" :label="spot.label" />
  </Teleport>
</template>

<style>
.pm-note-slot--section {
  margin: -0.5rem 0 0.5rem;
}
.pm-note-slot--block {
  margin: 0.15rem 0 0.4rem;
}
</style>
