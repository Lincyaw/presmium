<script setup lang="ts">
// The presenter's overview of the classroom, in the presenter panels of both forms and from the
// toolbar: questions by place (P-66), the understanding pulse (P-67), quizzes (P-64), predictions
// (P-68) and exercises (P-65). Entries without the shape their collection has are left out
// (`../domain/guards.ts`).
import { useMessages } from '@presmium/host'
import { computed } from 'vue'
import {
  COLLECTIONS,
  countedAnswers,
  distribution,
  isAnswer,
  isPrediction,
  isPulseVote,
  isQuestion,
  isQuizState,
  isSubmission,
  MESSAGES,
  placeText,
  predictionTally,
  questionsByPlace,
  summarize,
  summaryText,
  tally,
} from '../domain/index.ts'
import type { Prediction, PulseVote, Question, Submission } from '../domain/index.ts'
import { useAiAnswers } from './ai.ts'
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
const predictions = useCollection(from, COLLECTIONS.predictions, isPrediction)
const { failure, write } = useWrite()
const t = useMessages(MESSAGES)
const ai = useAiAnswers()

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

// How the class predicted: per choice, or the written predictions without their authors.
const predicted = computed(() => {
  const latest = new Map<string, Prediction>()
  for (const { value } of predictions.value) latest.set(value.predict, value)
  return byPlace([...latest.values()]).map((prediction) => {
    const result = predictionTally(prediction.predict, prediction.choices?.length ?? 0, predictions.value.map(item => item.value))
    return {
      id: prediction.predict,
      place: t.value.panel.predicted(placeText(prediction, t.value), result.respondents),
      question: prediction.question,
      choices: (prediction.choices ?? []).map((choice, i) => ({ choice, count: result.counts[i]! })),
      texts: result.texts,
    }
  })
})

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

/** Sends the AI's answer, once the presenter confirmed it, to the classroom as the question's reply. */
function sendAnswer(question: Question & { id: string }): void {
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
              <button v-if="status === 'active' && ai.provider.value && !q.reply && !ai.drafts.has(q.id)" type="button" class="pm-classroom-panel__ai" :title="t.questions.aiTitle(ai.provider.value)" @click="ai.answer(q.id, q)">
                {{ t.questions.ai(ai.provider.value) }}
              </button>
              <div v-if="ai.drafts.get(q.id)" class="pm-classroom-panel__draft" :data-state="ai.drafts.get(q.id)!.state">
                <p v-if="ai.drafts.get(q.id)!.state === 'running'" class="pm-classroom-status" role="status">
                  {{ t.questions.aiAnswering }}
                </p>
                <template v-else-if="ai.drafts.get(q.id)!.state === 'ready'">
                  <p class="pm-classroom-status">
                    {{ t.questions.aiDraft }}
                  </p>
                  <p class="pm-classroom-panel__answer">
                    {{ ai.drafts.get(q.id)!.text }}
                  </p>
                </template>
                <p v-else class="pm-classroom-error" role="alert">
                  {{ t.questions.aiFailed(ai.drafts.get(q.id)!.error ?? '') }}
                </p>
                <p class="pm-classroom-actions">
                  <button v-if="ai.drafts.get(q.id)!.state === 'ready'" type="button" @click="sendAnswer(q)">
                    {{ t.questions.send }}
                  </button>
                  <button type="button" @click="ai.discard(q.id)">
                    {{ t.questions.discard }}
                  </button>
                </p>
              </div>
              <p v-if="q.reply" class="pm-classroom-reply">
                {{ q.reply.provider ? t.questions.reply(q.reply.provider) : '' }}{{ q.reply.text }}
              </p>
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
      <section v-if="predicted.length" :aria-label="t.panel.predictions">
        <h4>{{ t.panel.predictions }}</h4>
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
.pm-classroom-panel__draft,
.pm-classroom-reply {
  margin: 0.25rem 0;
  padding-left: 0.5rem;
  border-left: 3px solid rgba(125, 125, 125, 0.4);
}
.pm-classroom-panel__answer,
.pm-classroom-reply {
  white-space: pre-wrap;
}
</style>
