<script setup lang="ts">
// A counter every window of the deck shares (useSharedState, scope 'local'), and one that
// other devices share too (scope 'remote', through the sync transports).
import { PmBoundary, useSharedState } from '@presmium/host'

const count = useSharedState('fixture.core.count', 0)
const remote = useSharedState('fixture.core.remote', 0, { scope: 'remote' })
</script>

<template>
  <PmBoundary name="FixtureShared">
    <p class="fx-shared">
      <output class="fx-shared__count">{{ count }}</output>
      <button type="button" @click="count++">
        Add one
      </button>
    </p>
    <p class="fx-remote">
      <output class="fx-remote__count">{{ remote }}</output>
      <button type="button" @click="remote++">
        Count on every device
      </button>
    </p>
  </PmBoundary>
</template>
