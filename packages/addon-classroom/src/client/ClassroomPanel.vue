<script setup lang="ts">
// The presenter's overview of the classroom, in the presenter panels of both forms and from the
// toolbar: questions by place (P-66), the understanding pulse (P-67), quizzes (P-64) and exercises (P-65).
// Entries without the shape their collection has are left out (`../domain/guards.ts`).
import { useMessages } from '@presmium/host'
import { computed } from 'vue'
import {
  COLLECTIONS,
  countedAnswers,
  distribution,
  isAnswer,
  isPulseVote,
  isQuestion,
  isQuizState,
  isSubmission,
  MESSAGES,
  placeText,
  questionsByPlace,
  summarize,
  summaryText,
  tally,
} from '../domain/index.ts'
import type { PulseVote, Question, Submission } from '../domain/index.ts'
import { useClassroomStore, useCollection, useSession, useWrite } from './use.ts'
import './style.css'

const { status, presenter } = useSession()
const store = useClassroomStore()
const from = () => store.value
const questions = useCollection(from, COLLECTIONS.questions, isQuestion)
const votes = useCollection(from, COLLECTIONS.pulse, isPulseVote)
const quizzes = useCollection(from, COLLECTIONS.quizzes, isQuizState)
const answers = useCollection(from, COLLECTIONS.answers, isAnswer)
const submissions = useCollection(from, COLLECTIONS.submissions, isSubmission)
const { failure, write } = useWrite()
const t = useMessages(MESSAGES)

const byPlace = <T extends { index: number }>(items: T[]) => [...items].sort((a, b) => a.index - b.index)

const questionGroups = computed(() => questionsByPlace(questions.value.map(({ id, value }) => ({ ...value, id })), t.value))
const open = computed(() => questions.value.filter(({ value }) => !value.answered).length)

const pulses = computed(() => {
  const latest = new Map<string, PulseVote>()
  for (const { value } of votes.value) latest.set(value.pulse, value)
  return byPlace([...latest.values()]).map((vote) => {
    const counts = distribution(vote.pulse, vote.levels.length, votes.value.map(item => item.value))
    return {
      id: vote.pulse,
      place: placeText(vote, t.value),
      levels: vote.levels.map((level, i) => `${level} ${t.value.people(counts[i]!)}`).join(t.value.panel.levels),
    }
  })
})

const quizRows = computed(() => byPlace(quizzes.value.map(({ id, value }) => ({ ...value, id }))).map((quiz) => {
  const result = tally(quiz.options.length, quiz.answer, countedAnswers(quiz.id, quiz, answers.value.map(item => item.value)))
  return { id: quiz.id, text: t.value.panel.quiz(placeText(quiz, t.value), quiz.open, result.respondents, result.correct) }
}))

const exercises = computed(() => {
  const groups = new Map<string, Submission[]>()
  for (const { value } of submissions.value) groups.set(value.exercise, [...groups.get(value.exercise) ?? [], value])
  return byPlace([...groups.values()].map(group => ({ ...group[0]!, summary: summarize(group) }))).map(({ summary, ...first }) => ({
    id: first.exercise,
    text: t.value.panel.exercise(placeText(first, t.value), summaryText(summary, t.value)),
  }))
})

function toggleAnswered(question: Question & { id: string }): void {
  const { id, ...value } = question
  write(() => store.value?.put<Question>(COLLECTIONS.questions, id, { ...value, answered: !value.answered }))
}
</script>

<template>
  <div class="pm-classroom-panel">
    <p v-if="!presenter" class="pm-classroom-status">
      {{ t.panel.waiting }}
    </p>
    <template v-else>
      <section :aria-label="t.panel.questions">
        <h4>{{ t.panel.open(open) }}</h4>
        <p v-if="!questionGroups.length" class="pm-classroom-status">
          {{ t.panel.none }}
        </p>
        <div v-for="group in questionGroups" :key="group.place" class="pm-classroom-panel__place" :data-section="group.section" :data-block="group.block">
          <p class="pm-classroom-panel__where">
            {{ group.place }}
          </p>
          <ul>
            <li v-for="q in group.questions" :key="q.id" :data-answered="q.answered ? '' : undefined">
              <strong>{{ q.name }}</strong>{{ t.colon }}{{ q.text }}
              <button v-if="status === 'active'" type="button" @click="toggleAnswered(q)">
                {{ q.answered ? t.questions.markUnanswered : t.questions.markAnswered }}
              </button>
            </li>
          </ul>
        </div>
      </section>
      <section v-if="pulses.length" :aria-label="t.panel.pulse">
        <h4>{{ t.panel.pulse }}</h4>
        <div v-for="pulse in pulses" :key="pulse.id" class="pm-classroom-panel__place" :data-pulse="pulse.id">
          <p class="pm-classroom-panel__where">
            {{ pulse.place }}
          </p>
          <p class="pm-classroom-panel__levels">
            {{ pulse.levels }}
          </p>
        </div>
      </section>
      <section v-if="quizRows.length" :aria-label="t.panel.quizzes">
        <h4>{{ t.panel.quizzes }}</h4>
        <p v-for="quiz in quizRows" :key="quiz.id" class="pm-classroom-panel__place" :data-quiz="quiz.id">
          {{ quiz.text }}
        </p>
      </section>
      <section v-if="exercises.length" :aria-label="t.panel.exercises">
        <h4>{{ t.panel.exercises }}</h4>
        <p v-for="exercise in exercises" :key="exercise.id" class="pm-classroom-panel__place" :data-exercise="exercise.id">
          {{ exercise.text }}
        </p>
      </section>
    </template>
    <p v-if="failure" class="pm-classroom-error" role="alert">
      {{ failure }}
    </p>
  </div>
</template>

<style scoped>
.pm-classroom-panel {
  display: grid;
  gap: 0.4rem;
  font-size: 0.85rem;
  line-height: 1.4;
  text-align: left;
}
.pm-classroom-panel h4 {
  margin: 0.25rem 0 0;
  font-size: 0.85rem;
}
.pm-classroom-panel p {
  margin: 0;
}
.pm-classroom-panel ul {
  margin: 0.1rem 0 0.3rem;
  padding-left: 1.2em;
}
.pm-classroom-panel li[data-answered] {
  color: var(--vp-c-text-2, inherit);
}
.pm-classroom-panel__where {
  font-weight: 600;
}
</style>
