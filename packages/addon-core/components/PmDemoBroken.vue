<script setup lang="ts">
import { PmBoundary } from '@presmium/host'

function Exploding(): never {
  throw new Error('故意抛出的错误')
}
</script>

<template>
  <PmBoundary name="PmDemoBroken">
    <Exploding />
  </PmBoundary>
</template>
