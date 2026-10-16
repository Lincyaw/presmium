<script setup lang="ts">
function Exploding(): never {
  throw new Error('fixture component failed on purpose')
}
</script>

<template>
  <Exploding />
</template>
