<script setup lang="ts">
import { PmPresenterPanels } from '@presmium/host'
import { useNav } from '@slidev/client'

const { isPresenter } = useNav()
</script>

<template>
  <PmPresenterPanels v-if="isPresenter" />
</template>
