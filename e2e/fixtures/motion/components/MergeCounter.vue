<script setup lang="ts">
import { useActions } from '@lincyaw/host'
import { ref } from 'vue'

// A deck component with named actions: the lecture's {cue}`click merge` and a click of the button run the
// same action, and a recording keeps the click. The count is a function of the merges so far.
const root = ref<HTMLElement>()
const merges = ref(0)
const VOCABULARY = ['l', 'o', 'w', 'e', 'r', 's', 't']
const NEW = ['lo', 'low', 'er', 'est']
const run = useActions(root, {
  merge: () => {
    merges.value = Math.min(NEW.length, merges.value + 1)
  },
  reset: () => {
    merges.value = 0
  },
}, { clear: () => (merges.value = 0) })
</script>

<template>
  <div ref="root" class="merge-counter" :data-merges="merges">
    <div class="merge-counter__vocab">
      <span v-for="token in VOCABULARY" :key="token" class="merge-counter__token">{{ token }}</span>
      <span v-for="token in NEW.slice(0, merges)" :key="token" class="merge-counter__token merge-counter__token--new">{{ token }}</span>
    </div>
    <p class="merge-counter__size">词表大小：{{ VOCABULARY.length + merges }}</p>
    <div class="merge-counter__actions">
      <button id="merge-once" type="button" class="pm-ui-button pm-ui-button--primary" @click="run('merge')">合并一次</button>
      <button id="merge-reset" type="button" class="pm-ui-button" @click="run('reset')">重置</button>
    </div>
  </div>
</template>

<style scoped>
.merge-counter {
  max-width: 34rem;
  margin: 1rem auto;
  padding: 1rem 1.25rem;
  border: 1px solid var(--pm-color-line-strong);
  border-radius: var(--pm-radius-control);
  font-family: var(--pm-font-sans);
}
.merge-counter__vocab {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  min-height: 2.2rem;
}
.merge-counter__token {
  padding: 0.2rem 0.6rem;
  border-radius: 0.35rem;
  background: var(--pm-color-surface);
  border: 1px solid var(--pm-color-line-strong);
  font-family: var(--pm-font-mono);
}
.merge-counter__token--new {
  background: var(--pm-color-accent);
  border-color: var(--pm-color-accent);
  color: var(--pm-color-bg);
}
.merge-counter__size {
  margin: 0.75rem 0;
  color: var(--pm-color-muted);
}
.merge-counter__actions {
  display: flex;
  gap: 0.5rem;
}
</style>
