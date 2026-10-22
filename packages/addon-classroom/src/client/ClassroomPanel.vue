<script setup lang="ts">
import { useMessages, useSectionConfig } from '@lincyaw/host'
import { computed } from 'vue'
import {
  CLASSROOM_ID,
  classroomRows,
  COLLECTIONS,
  exerciseTallyText,
  MESSAGES,
  placeText,
  questionsByPlace,
  sectionNumbers,
  toAnswer,
  toPrediction,
  toPulseVote,
  toQuestion,
  toQuizState,
  toSubmission,
  unansweredCount,
} from '../domain/index.ts'
import type { Question } from '../domain/index.ts'
import { useAiAnswers } from './ai-answers.ts'
import { useClassroomStore, useCollection, useGuardedWrite, useParticipation } from './composables.ts'
import QuestionItem from './QuestionItem.vue'
import './style.css'

const { status, presenter } = useParticipation()
const store = useClassroomStore()
const from = () => store.value
const questions = useCollection(from, COLLECTIONS.questions, toQuestion)
const votes = useCollection(from, COLLECTIONS.pulse, toPulseVote)
const quizzes = useCollection(from, COLLECTIONS.quizzes, toQuizState)
const answers = useCollection(from, COLLECTIONS.answers, toAnswer)
const submissions = useCollection(from, COLLECTIONS.submissions, toSubmission)
const predictions = useCollection(from, COLLECTIONS.predictions, toPrediction)
const { failure, write } = useGuardedWrite()
const t = useMessages(MESSAGES)
const ai = useAiAnswers()

const config = useSectionConfig(CLASSROOM_ID)
const numbers = computed(() => sectionNumbers(config.value))

const questionGroups = computed(() => questionsByPlace(questions.value.map(({ id, value }) => ({ ...value, id })), t.value, numbers.value))
const unanswered = computed(() => unansweredCount(questions.value.map(item => item.value)))

const rows = computed(() => classroomRows({
  quizzes: quizzes.value.map(({ id, value }) => ({ ...value, id })),
  answers: answers.value.map(item => item.value),
  predictions: predictions.value.map(item => item.value),
  votes: votes.value.map(item => item.value),
  submissions: submissions.value.map(item => item.value),
  numbers: numbers.value,
}))

const pulses = computed(() => rows.value.pulse.map(row => ({
  id: row.id,
  place: placeText(row, t.value),
  levels: row.levels.map((level, i) => `${level} ${t.value.people(row.counts[i]!)}`).join(t.value.panel.levels),
})))

const quizRows = computed(() => rows.value.quizzes.map(row => ({
  id: row.id,
  text: t.value.panel.quiz(placeText(row, t.value), row.open, row.tally.respondents, row.tally.correct),
})))

const predicted = computed(() => rows.value.predictions.map(row => ({
  id: row.id,
  place: t.value.panel.predicted(placeText(row, t.value), row.tally.respondents),
  question: row.question,
  choices: (row.choices ?? []).map((choice, i) => ({ choice, count: row.tally.counts[i]! })),
  texts: row.tally.texts,
})))

const exercises = computed(() => rows.value.exercises.map(row => ({
  id: row.id,
  text: t.value.panel.exercise(placeText(row, t.value), exerciseTallyText(row.tally, t.value)),
})))

function toggleAnswered(question: Question & { id: string }): void {
  const { id, ...value } = question
  write(() => store.value?.put<Question>(COLLECTIONS.questions, id, { ...value, answered: !value.answered }))
}

function sendReply(question: Question & { id: string }): void {
  const draft = ai.drafts.get(question.id)
  if (draft?.state !== 'ready') return
  const { id, ...value } = question
  const sent = write(() => store.value?.put<Question>(COLLECTIONS.questions, id, { ...value, answered: true, reply: { text: draft.text, ...draft.provider ? { provider: draft.provider } : {}, at: Date.now() } }))
  if (sent) ai.drafts.delete(id)
}
</script>

<template>
  <div class="pm-classroom-panel">
    <p v-if="!presenter" class="pm-classroom-status">
      {{ t.panel.waiting }}
    </p>
    <template v-else>
      <section :aria-label="t.panel.questions">
        <h4 class="pm-ui-heading">{{ t.panel.unanswered(unanswered) }}</h4>
        <p v-if="!questionGroups.length" class="pm-classroom-status">
          {{ t.panel.none }}
        </p>
        <p v-else-if="status === 'active' && ai.offered.value && !ai.provider.value" class="pm-classroom-status pm-classroom-panel__ai-setup">
          {{ t.questions.aiSetup }}
        </p>
        <div v-for="group in questionGroups" :key="group.label" class="pm-classroom-panel__place" :data-section="group.section" :data-block="group.block">
          <p class="pm-classroom-panel__where">
            {{ group.label }}
          </p>
          <ul>
            <QuestionItem
              v-for="q in group.questions"
              :key="q.id"
              :question="q"
              :active="status === 'active'"
              :ai="ai"
              @toggle-answered="toggleAnswered(q)"
              @send="sendReply(q)"
            />
          </ul>
        </div>
      </section>
      <section v-if="pulses.length" :aria-label="t.panel.pulse">
        <h4 class="pm-ui-heading">{{ t.panel.pulse }}</h4>
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
        <h4 class="pm-ui-heading">{{ t.panel.quizzes }}</h4>
        <p v-for="quiz in quizRows" :key="quiz.id" class="pm-classroom-panel__place" :data-quiz="quiz.id">
          {{ quiz.text }}
        </p>
      </section>
      <section v-if="predicted.length" :aria-label="t.panel.predictions">
        <h4 class="pm-ui-heading">{{ t.panel.predictions }}</h4>
        <div v-for="item in predicted" :key="item.id" class="pm-classroom-panel__place" :data-predict="item.id">
          <p class="pm-classroom-panel__where">
            {{ item.place }}
          </p>
          <p>{{ item.question }}</p>
          <ul>
            <li v-for="({ choice, count }, i) in item.choices" :key="i" :data-choice="choice" :data-count="count">
              {{ choice }}{{ t.colon }}{{ t.people(count) }}
            </li>
            <li v-for="(text, i) in item.texts" :key="i">
              {{ text }}
            </li>
          </ul>
        </div>
      </section>
      <section v-if="exercises.length" :aria-label="t.panel.exercises">
        <h4 class="pm-ui-heading">{{ t.panel.exercises }}</h4>
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
  gap: 0.5rem;
  color: var(--pm-color-ink);
  font-family: var(--pm-font-sans);
  font-size: 0.875rem;
  line-height: 1.5;
  text-align: left;
}
.pm-classroom-panel section {
  display: grid;
  gap: 0.35rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--pm-color-line);
}
.pm-classroom-panel section:first-child {
  padding-top: 0;
  border-top: 0;
}
.pm-classroom-panel p {
  margin: 0;
}
.pm-classroom-panel ul {
  margin: 0.15rem 0 0.35rem;
  padding-left: 1.2em;
}
.pm-classroom-panel li {
  margin: 0.25rem 0;
}
.pm-classroom-panel__where {
  font-weight: 600;
}
</style>
