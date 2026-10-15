<script setup lang="ts">
import { PmBoundary } from '@presmium/host'
import { computed } from 'vue'
import { useClassroomStore, useCollection, useSession, useWrite } from '../src/client/use.ts'
import { COLLECTIONS, DEFAULT_LEVELS, distribution, placeKey, voteId } from '../src/domain/index.ts'
import type { Place, PulseVote } from '../src/domain/index.ts'
import '../src/client/style.css'

// P-67, from `{pulse}`: learners of an active classroom say how well they follow; voting again
// replaces their vote. The presenter sees the distribution here and in the presenter view.
const props = withDefaults(defineProps<{
  question?: string
  levels?: string[]
  place?: Place
}>(), { question: '这一节理解了吗？', levels: () => DEFAULT_LEVELS })

const { me, status, joined, presenter } = useSession()
const store = useClassroomStore()
const votes = useCollection<PulseVote>(() => store.value, COLLECTIONS.pulse)
const { failure, write } = useWrite()

const id = computed(() => (props.place ? placeKey(props.place) : ''))
const counts = computed(() => distribution(id.value, props.levels.length, votes.value.map(item => item.value)))
const total = computed(() => counts.value.reduce((sum, n) => sum + n, 0))
const mine = computed(() => (me.value ? votes.value.find(item => item.id === voteId(id.value, me.value!.id))?.value : undefined))
const canVote = computed(() => joined.value && !presenter.value && status.value === 'active')

function vote(level: number): void {
  const participant = me.value
  if (!store.value || !participant || !props.place) return
  write(() => store.value!.put<PulseVote>(COLLECTIONS.pulse, voteId(id.value, participant.id), {
    ...props.place!,
    pulse: id.value,
    participant: participant.id,
    level,
    levels: props.levels,
    at: Date.now(),
  }))
}
</script>

<template>
  <PmBoundary name="PmPulse">
    <div class="pm-pulse pm-classroom-card" :data-pulse="id">
      <p class="pm-pulse__question">
        {{ question }}
      </p>
      <slot />
      <p v-if="canVote" class="pm-classroom-actions" role="group" :aria-label="question">
        <button v-for="(level, i) in levels" :key="i" type="button" :aria-pressed="mine?.level === i" @click="vote(i)">
          {{ level }}
        </button>
      </p>
      <p v-else-if="!joined" class="pm-classroom-status">
        加入课堂后，可以在这里告诉主讲你的理解程度。
      </p>
      <ul v-if="presenter" class="pm-pulse__distribution" aria-label="理解度分布">
        <li v-for="(level, i) in levels" :key="i" :data-level="level" :data-count="counts[i]">
          <span class="pm-pulse__label">{{ level }}</span>
          <span class="pm-pulse__bar" :style="{ width: `${total ? (counts[i]! / total) * 100 : 0}%` }" />
          <span class="pm-pulse__count">{{ counts[i] }} 人</span>
        </li>
      </ul>
      <p v-if="failure" class="pm-classroom-error" role="alert">
        {{ failure }}
      </p>
    </div>
  </PmBoundary>
</template>

<style scoped>
.pm-pulse__question {
  font-weight: 600;
}
.pm-pulse button[aria-pressed='true'] {
  border-color: #2563eb;
  background: rgba(37, 99, 235, 0.15);
}
.pm-pulse__distribution {
  margin: 0.25rem 0;
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
  border-radius: 0.2em;
  background: #2563eb;
}
.pm-pulse__count {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
