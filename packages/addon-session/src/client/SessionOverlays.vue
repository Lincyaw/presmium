<script setup lang="ts">
import { claimFirst } from '@lincyaw/host'
import SessionBadge from './SessionBadge.vue'

const badge = claimFirst('presmium.session.badge')
</script>

<template>
  <Teleport v-if="badge.owns.value" to="body">
    <SessionBadge class="pm-session-badge--page" />
  </Teleport>
</template>
