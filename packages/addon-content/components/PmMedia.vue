<script setup lang="ts">
import { computed } from 'vue'
import { mediaElements } from '../src/domain/index.ts'
import type { MediaKind } from '../src/domain/index.ts'

/**
 * A media block (P-42) from `{video}`, `{audio}` or `{animation}`: the media
 * element, and for an animation with a still image both images. `src` and
 * `still` are the URLs the renderer published the files at.
 */
const props = defineProps<{
  kind: MediaKind
  src: string
  still?: string
  caption?: string
  controls?: boolean
  autoplay?: boolean
  loop?: boolean
  muted?: boolean
  width?: number
  height?: number
  alt?: string
}>()

const elements = computed(() => mediaElements(props.kind, props, props.still !== undefined).map(({ tag, file, attrs }) => ({
  tag,
  attrs: { ...attrs, src: file === 'still' ? props.still : props.src },
})))
</script>

<template>
  <figure class="pm-media" :data-kind="kind">
    <component :is="element.tag" v-for="(element, i) in elements" :key="i" v-bind="element.attrs" />
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
