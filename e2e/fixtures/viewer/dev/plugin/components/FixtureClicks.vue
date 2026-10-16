<script setup lang="ts">
// A word per click, then a last mark one click later: the clicks are relative, so removing a word
// moves the mark one step earlier.
defineProps<{ items: string[] }>()
</script>

<template>
  <p class="fx-clicks">
    <span v-for="item in items" :key="item" v-click class="fx-clicks__item">{{ item }}</span>
    <b v-click class="fx-clicks__last">尾</b>
  </p>
</template>
