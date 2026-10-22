<script setup lang="ts">
import { useMessages } from '@lincyaw/host'
import { computed } from 'vue'
import { useClassroomStore, useCollection, useGuardedWrite, useParticipation } from '../src/client/composables.ts'
import { COLLECTIONS, MESSAGES, placeKey, pulseTally, toPulseVote, voteId } from '../src/domain/index.ts'
import type { Place, PulseVote } from '../src/domain/index.ts'
import '../src/client/style.css'

const props = defineProps<{
  question?: string
  levels?: string[]
  place?: Place
}>()

const { me, status, joined, presenter } = useParticipation()
const store = useClassroomStore()
const votes = useCollection(() => store.value, COLLECTIONS.pulse, toPulseVote)
const { failure, write } = useGuardedWrite()
const t = useMessages(MESSAGES)
const question = computed(() => props.question ?? t.value.pulse.question)
const levels = computed(() => props.levels ?? t.value.pulse.levels)

const id = computed(() => (props.place ? placeKey(props.place) : ''))
const counts = computed(() => pulseTally(id.value, levels.value.length, votes.value.map(item => item.value)))
const total = computed(() => counts.value.reduce((sum, n) => sum + n, 0))
const mine = computed(() => (me.value ? votes.value.find(item => item.id === voteId(id.value, me.value!.id))?.value : undefined))
const canVote = computed(() => joined.value && !presenter.value && status.value === 'active')

function vote(level: number): void {
  const participant = me.value
  if (!store.value || !participant || !props.place) return
  write(() => store.value!.put<PulseVote>(COLLECTIONS.pulse, voteId(id.value, participant.id), {
    ...props.place!,
    pulseId: id.value,
    participant: participant.id,
    level,
    levels: levels.value,
    at: Date.now(),
  }))
}
</script>

<template>
  <div class="pm-pulse pm-classroom-card" :data-pulse="id">
    <p class="pm-pulse__question">
      {{ question }}
    </p>
    <slot />
    <p v-if="canVote" class="pm-classroom-actions" role="group" :aria-label="question">
      <button v-for="(level, i) in levels" :key="i" type="button" class="pm-ui-button pm-ui-button--small" :aria-pressed="mine?.level === i" @click="vote(i)">
        {{ level }}
      </button>
    </p>
    <p v-else-if="!joined" class="pm-classroom-status">
      {{ t.pulse.joinFirst }}
    </p>
    <ul v-if="presenter" class="pm-pulse__distribution" :aria-label="t.pulse.distribution">
      <li v-for="(level, i) in levels" :key="i" :data-level="level" :data-count="counts[i]">
        <span class="pm-pulse__label">{{ level }}</span>
        <span class="pm-pulse__bar" :style="{ width: `${total ? (counts[i]! / total) * 100 : 0}%` }" />
        <span class="pm-pulse__count">{{ t.people(counts[i]!) }}</span>
      </li>
    </ul>
    <p v-if="failure" class="pm-classroom-error" role="alert">
      {{ failure }}
    </p>
  </div>
</template>

<style scoped>
.pm-pulse__question {
  font-weight: 600;
}
.pm-pulse__distribution {
  margin: 0.4em 0;
  padding: 0;
  list-style: none;
}
.pm-pulse__distribution li {
  display: grid;
  grid-template-columns: 6em 1fr 3.5em;
  align-items: center;
  gap: 0.4rem;
}
.pm-pulse__bar {
  height: 0.6em;
  min-width: 1px;
  border-radius: var(--pm-radius-pill);
  background: var(--pm-color-accent);
}
.pm-pulse__count {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
