<script setup lang="ts">
import { usePrefersReducedMotion, usePresentationMode } from '@presmium/host'
import { deriveOptions, Markmap } from 'markmap-view'
import { onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue'
import { decodeMarkmap } from '../domain/index.ts'
import { messages } from './locale.ts'

const props = defineProps<{ data: string }>()

const { root, options } = decodeMarkmap(props.data)
// Readers may zoom and pan the map; on a slide it stays as laid out.
const interactive = usePresentationMode() === 'document'
const reduced = usePrefersReducedMotion()
const svg = useTemplateRef<SVGSVGElement>('svg')
const failure = shallowRef<unknown>()
let markmap: Markmap | undefined
let observer: ResizeObserver | undefined

// Slides are mounted hidden before they are shown, and node sizes can only be
// measured while visible, so the map is drawn whenever the svg gets a size.
async function draw(el: SVGSVGElement) {
  if (!el.clientWidth) return
  markmap ??= Markmap.create(el, { ...deriveOptions(options), autoFit: false, zoom: interactive, pan: interactive })
  const { duration } = markmap.options
  // The map appears complete at once, as exports and screenshots need; only
  // folding a node afterwards animates, unless motion is reduced.
  await markmap.setData(root, { duration: 0 })
  fit(markmap, el)
  markmap.setOptions({ duration: reduced.value ? 0 : duration })
}

// Room around the laid-out nodes for the circles drawn on their bottom edges.
const PADDING = 8

// Markmap's own fit measures the svg on screen, which a scaled slide distorts;
// fit in layout pixels instead.
function fit(map: Markmap, el: SVGSVGElement) {
  const { x1, y1, x2, y2 } = map.state.rect
  const [width, height] = [el.clientWidth, el.clientHeight]
  const scale = map.options.fitRatio * Math.min(
    width / (x2 - x1 + 2 * PADDING),
    height / (y2 - y1 + 2 * PADDING),
    map.options.maxInitialScale,
  )
  map.zoom.extent([[0, 0], [width, height]])
  map.zoom.scaleTo(map.svg, scale)
  map.zoom.translateTo(map.svg, (x1 + x2) / 2, (y1 + y2) / 2)
}

// The fold toggles markmap draws (a circle on each node with children) are buttons for the
// keyboard too: focusable, named after their node, saying whether it is expanded.
const TOGGLE = 'g.markmap-node > circle'

function describeToggles(el: SVGSVGElement) {
  for (const circle of el.querySelectorAll(TOGGLE)) {
    const node = circle.parentElement!
    circle.setAttribute('tabindex', '0')
    circle.setAttribute('role', 'button')
    circle.setAttribute('aria-expanded', String(!node.classList.contains('markmap-fold')))
    circle.setAttribute('aria-label', messages().toggle(node.querySelector('foreignObject')?.textContent?.trim() ?? ''))
  }
}

// Enter and Space on a toggle click it, as markmap folds a node on a click; the deck does not see the key.
function onKeydown(event: KeyboardEvent) {
  const target = event.target as Element
  if ((event.key !== 'Enter' && event.key !== ' ') || !target.matches(TOGGLE)) return
  event.preventDefault()
  event.stopPropagation()
  target.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

let toggles: MutationObserver | undefined

onMounted(() => {
  const el = svg.value!
  observer = new ResizeObserver(() => {
    draw(el).catch((error: unknown) => {
      failure.value = error
    })
  })
  observer.observe(el)
  // Markmap redraws nodes, and their fold class, whenever a node is folded or unfolded.
  toggles = new MutationObserver(() => describeToggles(el))
  toggles.observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] })
})

onBeforeUnmount(() => {
  observer?.disconnect()
  toggles?.disconnect()
  markmap?.destroy()
})

// Rethrown from a watcher so that the surrounding PmBoundary shows the failure.
watch(failure, (error) => {
  throw error
})
</script>

<template>
  <svg ref="svg" class="pm-markmap" @keydown="onKeydown" />
</template>

<style scoped>
.pm-markmap {
  display: block;
  width: 100%;
  height: var(--pm-markmap-height, 18rem);
  --markmap-text-color: currentColor;
}
.pm-markmap :deep(g.markmap-node > circle:focus-visible) {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}
</style>
