<script setup lang="ts">
import { useNav } from '@slidev/client'
import { shallowRef, watch } from 'vue'
import { screen } from './setup/screen.ts'
import { messages } from './src/client/messages.ts'

const { isPresenter, isPrintMode } = useNav()
const frame = shallowRef<HTMLElement>()

/**
 * A frozen audience view keeps showing the slide it showed when `f` was pressed:
 * the frame covers the slide with a static copy of every layer beneath it, while
 * navigation goes on underneath.
 */
function freeze(frame: HTMLElement): void {
  const content = frame.closest('.slidev-slide-content')
  if (!content) return
  const copies = [...content.children]
    .filter(layer => !layer.contains(frame))
    .map((layer) => {
      const copy = layer.cloneNode(true) as Element
      for (const el of [copy, ...copy.querySelectorAll('[id]')]) el.removeAttribute('id')
      return copy
    })
  frame.style.backgroundColor = getComputedStyle(content).backgroundColor
  frame.replaceChildren(...copies)
}

watch([() => screen.mode, frame], ([mode, el]) => {
  if (!el) return
  if (mode === 'frozen') freeze(el)
  else el.replaceChildren()
}, { flush: 'sync' })

/** Read when the badge shows: the page's language is set by then. */
const label = (mode: 'black' | 'frozen') => messages().badge[mode]
</script>

<template>
  <template v-if="!isPrintMode">
    <!-- The presenter keeps the live slides and gets a reminder of what the audience sees. -->
    <template v-if="isPresenter">
      <div v-if="screen.mode !== 'live'" class="pm-stage-badge" :data-mode="screen.mode">
        {{ label(screen.mode) }}
      </div>
    </template>
    <template v-else>
      <div v-show="screen.mode === 'frozen'" ref="frame" class="pm-stage-frozen" aria-hidden="true" />
      <Teleport to="body">
        <div v-if="screen.mode === 'black'" class="pm-stage-black" />
      </Teleport>
    </template>
  </template>
</template>
