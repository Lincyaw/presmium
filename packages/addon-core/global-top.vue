<script setup lang="ts">
import { useNav } from '@slidev/client'
import PresenterPanels from './src/client/PresenterPanels.vue'

const { isPresenter } = useNav()
</script>

<template>
  <PresenterPanels v-if="isPresenter" />
</template>
