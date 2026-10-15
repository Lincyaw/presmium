<script setup lang="ts">
import { PmBoundary } from '@presmium/host'

function Exploding(): never {
  throw new Error('fixture component failed on purpose')
}
</script>

<template>
  <PmBoundary name="FixtureBroken">
    <Exploding />
  </PmBoundary>
</template>
