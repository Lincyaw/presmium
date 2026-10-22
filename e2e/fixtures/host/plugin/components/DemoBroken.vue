<script setup lang="ts">
// Throws while it renders: the host shows a placeholder in its place and lists the error.
function Exploding(): never {
  throw new Error('故意抛出的错误')
}
</script>

<template>
  <Exploding />
</template>
