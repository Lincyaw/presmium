<script setup lang="ts">
import { useMessages } from '@lincyaw/host'
import { LECTURE_MESSAGES } from '../domain/index.ts'
import { lecturesAvailable, playing, useViewer } from './state.ts'

const t = useMessages(LECTURE_MESSAGES)
const viewer = useViewer()
</script>

<template>
  <button v-if="lecturesAvailable && !playing" type="button" class="pm-present__button" @click="viewer.setView('lecture')">{{ t.player.play }}</button>
</template>
