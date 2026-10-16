<script setup lang="ts">
// Throws in its own setup while `fail` is set, as a component the author is still writing.
const props = defineProps<{ fail?: boolean }>()
if (props.fail) throw new Error('boom')
</script>

<template>
  <p class="fx-boom">
    all good
  </p>
</template>
