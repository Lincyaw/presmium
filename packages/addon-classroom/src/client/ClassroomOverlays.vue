<script setup lang="ts">
import { claimFirst } from '@lincyaw/host'
import NotesLayer from './NotesLayer.vue'

const layer = claimFirst('presmium.classroom.notes')
</script>

<template>
  <NotesLayer v-if="layer.owns.value" />
</template>
