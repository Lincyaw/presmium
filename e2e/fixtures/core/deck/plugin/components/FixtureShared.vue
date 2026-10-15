<script setup lang="ts">
// A counter every window of the deck shares (useSharedState, scope 'local').
import { PmBoundary, useSharedState } from '@presmium/host'

const count = useSharedState('fixture.core.count', 0)
</script>

<template>
  <PmBoundary name="FixtureShared">
    <p class="fx-shared">
      <output class="fx-shared__count">{{ count }}</output>
      <button type="button" @click="count++">
        Add one
      </button>
    </p>
  </PmBoundary>
</template>
