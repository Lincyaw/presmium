<script setup lang="ts">
import { PmBoundary } from '@presmium/host'

/**
 * A media block (P-42): the video, audio or animated image comes as the
 * default slot, written by the renderer from the media directive. The other
 * props of the directive (`src`, sizes, flags) are already on that element.
 */
defineOptions({ inheritAttrs: false })
defineProps<{ kind: string, caption?: string }>()
</script>

<template>
  <PmBoundary name="PmMedia">
    <figure class="pm-media" :data-kind="kind">
      <slot />
      <figcaption v-if="caption">
        {{ caption }}
      </figcaption>
    </figure>
  </PmBoundary>
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
