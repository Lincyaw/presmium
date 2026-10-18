<script setup lang="ts">
import { useNav } from '@slidev/client'
import { shallowRef, watch } from 'vue'
import { messages } from './src/client/messages.ts'
import { useScreen } from './src/client/screen.ts'

const { isPresenter, isPrintMode } = useNav()
const { mode } = useScreen()
const frame = shallowRef<HTMLElement>()

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

watch([mode, frame], ([current, el]) => {
  if (!el) return
  if (current === 'frozen') freeze(el)
  else el.replaceChildren()
}, { flush: 'sync' })

const label = (which: 'black' | 'frozen') => messages().badge[which]
</script>

<template>
  <template v-if="!isPrintMode">
    <template v-if="isPresenter">
      <div v-if="mode !== 'live'" class="pm-stage-badge" :data-mode="mode">
        {{ label(mode) }}
      </div>
    </template>
    <template v-else>
      <div v-show="mode === 'frozen'" ref="frame" class="pm-stage-frozen" aria-hidden="true" />
      <Teleport to="body">
        <div v-if="mode === 'black'" class="pm-stage-black" />
      </Teleport>
    </template>
  </template>
</template>
