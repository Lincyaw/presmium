<script setup lang="ts">
import { useLocale } from '@presmium/host'
import { computed } from 'vue'
import { captionTracks, mediaElements } from '../src/domain/index.ts'
import type { MediaKind } from '../src/domain/index.ts'

/**
 * A media block (P-42) from `{video}`, `{audio}` or `{animation}`: the media
 * element, and for an animation with a still image both images. A video
 * shows its `poster` before it plays and has a caption track per language of
 * `captions`, labelled with the language's name in the UI language;
 * `captionsDefault` shows at first. `src`, `still`, `poster` and the files of
 * `captions` are the URLs the renderer published the files at.
 */
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
/* An animation gives way to its still image when the system asks for reduced motion. */
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
