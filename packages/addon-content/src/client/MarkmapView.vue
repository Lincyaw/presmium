<script setup lang="ts">
import { currentLocale, usePrefersReducedMotion, usePresentationMode } from '@presmium/host'
import { deriveOptions, Markmap } from 'markmap-view'
import { onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue'
import { decodeMarkmap, MESSAGES } from '../domain/index.ts'

const props = defineProps<{ data: string }>()

const { root, options } = decodeMarkmap(props.data)
const interactive = usePresentationMode() === 'document'
const reduced = usePrefersReducedMotion()
const svg = useTemplateRef<SVGSVGElement>('svg')
const failure = shallowRef<unknown>()
let markmap: Markmap | undefined
let observer: ResizeObserver | undefined

async function draw(el: SVGSVGElement) {
  if (!el.clientWidth) return
  if (markmap) {
    fit(markmap, el)
    return
  }
  const map = markmap = Markmap.create(el, { ...deriveOptions(options), autoFit: false, zoom: interactive, pan: interactive })
  const { duration } = map.options
  await map.setData(root, { duration: 0 })
  fit(map, el)
  map.setOptions({ duration: reduced.value ? 0 : duration })
}

const PADDING = 8

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

const TOGGLE = 'g.markmap-node > circle'

function describeToggles(el: SVGSVGElement) {
  for (const circle of el.querySelectorAll(TOGGLE)) {
    const node = circle.parentElement!
    circle.setAttribute('tabindex', '0')
    circle.setAttribute('role', 'button')
    circle.setAttribute('aria-expanded', String(!node.classList.contains('markmap-fold')))
    circle.setAttribute('aria-label', MESSAGES[currentLocale()].toggle(node.querySelector('foreignObject')?.textContent?.trim() ?? ''))
  }
}

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
  toggles = new MutationObserver(() => describeToggles(el))
  toggles.observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] })
})

onBeforeUnmount(() => {
  observer?.disconnect()
  toggles?.disconnect()
  markmap?.destroy()
})

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
