<script setup lang="ts">
import { useLocale } from '@lincyaw/host'
import { computed } from 'vue'
import { captionTracks, mediaElements } from '../src/domain/index.ts'
import type { MediaKind } from '../src/domain/index.ts'

const props = defineProps<{
  kind: MediaKind
  src: string
  still?: string
  poster?: string
  captions?: Record<string, string>
  captionsDefault?: string
  caption?: string
  controls?: boolean
  autoplay?: boolean
  loop?: boolean
  muted?: boolean
  width?: number
  height?: number
  alt?: string
}>()

const locale = useLocale()
const elements = computed(() => mediaElements(props.kind, props, props.still !== undefined).map(({ tag, file, attrs }) => ({
  tag,
  attrs: { ...attrs, src: file === 'still' ? props.still : props.src, ...tag === 'video' && props.poster ? { poster: props.poster } : {} },
})))
const tracks = computed(() => (props.kind === 'video' ? captionTracks(props.captions, props.captionsDefault, locale.value) : []))
</script>

<template>
  <figure class="pm-media" :data-kind="kind">
    <component :is="element.tag" v-for="(element, i) in elements" :key="i" v-bind="element.attrs">
      <track v-for="track in element.tag === 'video' ? tracks : []" :key="track.srclang" kind="captions" :src="track.src" :srclang="track.srclang" :label="track.label" :default="track.default">
    </component>
    <figcaption v-if="caption">
      {{ caption }}
    </figcaption>
  </figure>
</template>

<style>
.pm-media {
  margin: 0;
}
.pm-media :is(video, audio, img) {
  display: block;
  max-width: 100%;
}
.pm-media figcaption {
  margin-top: 0.4em;
  color: var(--pm-color-muted);
  font-family: var(--pm-font-sans);
  font-size: 0.85em;
}
.pm-media .pm-media-still {
  display: none;
}
@media (prefers-reduced-motion: reduce) {
  .pm-media .pm-media-motion {
    display: none;
  }
  .pm-media .pm-media-still {
    display: block;
  }
}
</style>
