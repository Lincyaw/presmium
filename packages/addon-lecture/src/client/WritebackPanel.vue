<script setup lang="ts">
import { useMessages, useService } from '@presmium/host'
import { AGENT } from '@presmium/kernel'
import { LECTURE_MESSAGES } from '../domain/index.ts'
import { editing, writebackWanted } from './dock.ts'

const t = useMessages(LECTURE_MESSAGES)
const agent = useService(AGENT)
</script>

<template>
  <span v-if="editing && agent" class="pm-lecture-writeback-toolbar">
    <button type="button" class="pm-lecture-writeback__toggle pm-ui-button pm-ui-button--small" :aria-pressed="writebackWanted ? 'true' : 'false'" @click="writebackWanted = !writebackWanted">
      {{ t.writeback.toggle }}
    </button>
  </span>
</template>

<style scoped>
.pm-lecture-writeback-toolbar {
  display: inline-flex;
  align-items: center;
}
</style>
