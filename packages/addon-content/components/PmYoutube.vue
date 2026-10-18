<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ id: string, start?: number, width?: number, height?: number, caption?: string }>()

const src = computed(() => `https://www.youtube-nocookie.com/embed/${encodeURIComponent(props.id)}${props.start ? `?start=${props.start}` : ''}`)
</script>

<template>
  <figure class="pm-media pm-youtube" data-kind="youtube">
    <iframe
      :src="src"
      :title="caption || 'YouTube'"
      :width="width ?? 560"
      :height="height ?? 315"
      loading="lazy"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      referrerpolicy="strict-origin-when-cross-origin"
      allowfullscreen
    />
    <figcaption v-if="caption">
      {{ caption }}
    </figcaption>
  </figure>
</template>

<style>
.pm-youtube iframe {
  display: block;
  max-width: 100%;
  border: 0;
}
</style>
