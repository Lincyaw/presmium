<script setup lang="ts">
// The deck's component; its data loader runs where the site's dev server runs (agent-host in SHARED mode).
import { data } from './probe.data.ts'
</script>

<template>
  <pre class="probe">{{ data }}</pre>
</template>
