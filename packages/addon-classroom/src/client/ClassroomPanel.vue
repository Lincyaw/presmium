<script setup lang="ts">
// The presenter's overview of the classroom, in the presenter panels of both forms and from the
// toolbar: questions by place (P-66), the understanding pulse (P-67), quizzes (P-64) and exercises (P-65).
import { computed } from 'vue'
import { COLLECTIONS, countedAnswers, distribution, placeText, questionsByPlace, summarize, tally } from '../domain/index.ts'
import type { Answer, PulseVote, Question, QuizState, Submission } from '../domain/index.ts'
import { useClassroomStore, useCollection, useSession, useWrite } from './use.ts'
import './style.css'

const { status, presenter } = useSession()
const store = useClassroomStore()
const from = () => store.value
const questions = useCollection<Question>(from, COLLECTIONS.questions)
const votes = useCollection<PulseVote>(from, COLLECTIONS.pulse)
const quizzes = useCollection<QuizState>(from, COLLECTIONS.quizzes)
const answers = useCollection<Answer>(from, COLLECTIONS.answers)
const submissions = useCollection<Submission>(from, COLLECTIONS.submissions)
const { failure, write } = useWrite()

const byPlace = <T extends { index: number }>(items: T[]) => [...items].sort((a, b) => a.index - b.index)

const questionGroups = computed(() => questionsByPlace(questions.value.map(({ id, value }) => ({ ...value, id }))))
const open = computed(() => questions.value.filter(({ value }) => !value.answered).length)

const pulses = computed(() => {
  const latest = new Map<string, PulseVote>()
  for (const { value } of votes.value) latest.set(value.pulse, value)
  return byPlace([...latest.values()]).map(vote => ({
    id: vote.pulse,
    place: placeText(vote),
    levels: vote.levels,
    counts: distribution(vote.pulse, vote.levels.length, votes.value.map(item => item.value)),
  }))
})

const quizRows = computed(() => byPlace(quizzes.value.map(({ id, value }) => ({ ...value, id }))).map(quiz => ({
  ...quiz,
  result: tally(quiz.options.length, quiz.answer, countedAnswers(quiz.id, quiz, answers.value.map(item => item.value))),
})))

const exercises = computed(() => {
  const groups = new Map<string, Submission[]>()
  for (const { value } of submissions.value) groups.set(value.exercise, [...groups.get(value.exercise) ?? [], value])
  return byPlace([...groups.values()].map(group => ({ ...group[0]!, summary: summarize(group) })))
})

function toggleAnswered(question: Question & { id: string }): void {
  const { id, ...value } = question
  write(() => store.value?.put<Question>(COLLECTIONS.questions, id, { ...value, answered: !value.answered }))
}
</script>

<template>
  <div class="pm-classroom-panel">
    <p v-if="!presenter" class="pm-classroom-status">
      主讲创建课堂后，这里按位置汇总提问、理解度、测验与练习。
    </p>
    <template v-else>
      <section aria-label="提问">
        <h4>提问（未回答 {{ open }}）</h4>
        <p v-if="!questionGroups.length" class="pm-classroom-status">
          还没有提问
        </p>
        <div v-for="group in questionGroups" :key="group.place" class="pm-classroom-panel__place" :data-section="group.section" :data-block="group.block">
          <p class="pm-classroom-panel__where">
            {{ group.place }}
          </p>
          <ul>
            <li v-for="q in group.questions" :key="q.id" :data-answered="q.answered ? '' : undefined">
              <strong>{{ q.name }}</strong>：{{ q.text }}
              <button v-if="status === 'active'" type="button" @click="toggleAnswered(q)">
                {{ q.answered ? '标为未回答' : '标为已回答' }}
              </button>
            </li>
          </ul>
        </div>
      </section>
      <section v-if="pulses.length" aria-label="理解度">
        <h4>理解度</h4>
        <div v-for="pulse in pulses" :key="pulse.id" class="pm-classroom-panel__place" :data-pulse="pulse.id">
          <p class="pm-classroom-panel__where">
            {{ pulse.place }}
          </p>
          <p class="pm-classroom-panel__levels">
            {{ pulse.levels.map((level, i) => `${level} ${pulse.counts[i]} 人`).join(' · ') }}
          </p>
        </div>
      </section>
      <section v-if="quizRows.length" aria-label="测验">
        <h4>测验</h4>
        <p v-for="quiz in quizRows" :key="quiz.id" class="pm-classroom-panel__place" :data-quiz="quiz.id">
          {{ placeText(quiz) }}：{{ quiz.open ? '作答中' : '已关闭' }}，已作答 {{ quiz.result.respondents }} 人，答对 {{ quiz.result.correct }} 人
        </p>
      </section>
      <section v-if="exercises.length" aria-label="练习">
        <h4>练习</h4>
        <p v-for="exercise in exercises" :key="exercise.exercise" class="pm-classroom-panel__place" :data-exercise="exercise.exercise">
          {{ placeText(exercise) }}：已提交 {{ exercise.summary.submitted }} 人，通过 {{ exercise.summary.passed }} 人<template v-if="exercise.summary.kinds.length">；常见错误：{{ exercise.summary.kinds.map(([kind, n]) => `${kind} ${n} 人`).join('，') }}</template>
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
