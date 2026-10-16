<script setup lang="ts">
function Exploding(): never {
  throw new Error('故意抛出的错误')
}
</script>

<template>
  <Exploding />
</template>
