<script setup lang="ts">
import { useMessages } from '@lincyaw/host'
import { computed, ref, useId, watch } from 'vue'
import { useClassroomStore, useCollection, useSession, useWrite } from '../src/client/use.ts'
import { acceptsAnswers, answerId, COLLECTIONS, countedAnswers, isAnswer, isCorrect, isQuizState, lateAnswers, MESSAGES, optionLetter, placeKey, quizSwitched, tally } from '../src/domain/index.ts'
import type { Answer, Place, QuizState } from '../src/domain/index.ts'
import '../src/client/style.css'

const props = defineProps<{
  options: string[]
  answer: number[]
  place?: Place
}>()

const { me, status, joined, presenter } = useSession()
const store = useClassroomStore()
const quizzes = useCollection(() => store.value, COLLECTIONS.quizzes, isQuizState)
const answers = useCollection(() => store.value, COLLECTIONS.answers, isAnswer)
const { failure, write } = useWrite()
const t = useMessages(MESSAGES)
const name = useId()

const id = computed(() => (props.place ? placeKey(props.place) : ''))
const state = computed(() => quizzes.value.find(item => item.id === id.value)?.value)
const counted = computed(() => countedAnswers(id.value, state.value, answers.value.map(item => item.value)))
const late = computed(() => lateAnswers(id.value, state.value, answers.value.map(item => item.value)))
const result = computed(() => tally(props.options.length, props.answer, counted.value))
const multiple = computed(() => props.answer.length > 1)
const open = computed(() => acceptsAnswers(status.value, state.value))
const closed = computed(() => state.value?.open === false)
const submitted = computed(() => (me.value ? answers.value.find(item => item.id === answerId(id.value, me.value!.id))?.value : undefined))
const mine = computed(() => (closed.value ? counted.value.find(a => a.participant === me.value?.id) : submitted.value))

const choice = ref<number[]>([])
const tried = ref<number[]>()
watch([mine, closed], ([answer]) => {
  if (answer && (closed.value || choice.value.length === 0)) choice.value = [...answer.choice]
}, { immediate: true })

const canAnswer = computed(() => (joined.value ? !presenter.value && open.value : true))
const showTally = computed(() => joined.value && (presenter.value || closed.value))
const revealed = computed(() => (joined.value ? closed.value : tried.value !== undefined))
const letters = (choice: number[]) => choice.map(optionLetter).join(t.value.quiz.letters)

const statusText = computed(() => {
  const { quiz } = t.value
  if (!joined.value) {
    if (!tried.value) return quiz.selfTest
    return isCorrect(tried.value, props.answer) ? quiz.right : quiz.wrong(letters(props.answer))
  }
  if (presenter.value) return open.value ? quiz.answering : closed.value ? quiz.closed : status.value === 'active' ? quiz.notOpen : quiz.ended
  if (closed.value) {
    const verdict = mine.value ? quiz.yours(isCorrect(mine.value.choice, props.answer)) : ''
    return `${quiz.closed}${verdict}${late.value.some(a => a.participant === me.value?.id) ? quiz.lateMine : ''}`
  }
  if (status.value !== 'active') return quiz.ended
  if (!open.value) return quiz.waiting
  return submitted.value ? quiz.submitted(letters(submitted.value.choice)) : quiz.open
})

function toggle(i: number): void {
  if (!multiple.value) choice.value = [i]
  else choice.value = choice.value.includes(i) ? choice.value.filter(c => c !== i) : [...choice.value, i].sort((a, b) => a - b)
}

function submit(): void {
  if (!joined.value) {
    tried.value = [...choice.value]
    return
  }
  const participant = me.value
  if (!store.value || !participant || !canAnswer.value) return
  write(() => store.value!.put<Answer>(COLLECTIONS.answers, answerId(id.value, participant.id), {
    quiz: id.value,
    participant: participant.id,
    name: participant.name,
    choice: choice.value,
    at: Date.now(),
  }))
}

function setOpen(next: boolean): void {
  if (!store.value || !props.place) return
  const quiz = { ...props.place, options: props.options, answer: props.answer, openedAt: state.value?.openedAt }
  write(() => store.value!.put<QuizState>(COLLECTIONS.quizzes, id.value, quizSwitched(quiz, next, counted.value, Date.now())))
}
</script>

<template>
  <div class="pm-quiz pm-classroom-card" :data-quiz="id" :data-state="open ? 'open' : closed ? 'closed' : 'waiting'">
    <div class="pm-quiz__prompt">
      <slot />
    </div>
    <form class="pm-quiz__form" @submit.prevent="submit">
      <ol class="pm-quiz__options">
        <li
          v-for="(option, i) in options"
          :key="i"
          class="pm-quiz__option"
          :data-option="optionLetter(i)"
          :data-correct="revealed && answer.includes(i) ? '' : undefined"
        >
          <label>
            <input class="pm-ui-checkbox" :type="multiple ? 'checkbox' : 'radio'" :name="name" :checked="choice.includes(i)" :disabled="!canAnswer" @change="toggle(i)">
            <span class="pm-quiz__letter">{{ optionLetter(i) }}</span>
            <span>{{ option }}</span>
          </label>
          <span v-if="showTally" class="pm-quiz__count">{{ t.people(result.counts[i]!) }}</span>
        </li>
      </ol>
      <p class="pm-classroom-actions">
        <button v-if="!presenter" type="submit" class="pm-ui-button pm-ui-button--primary pm-ui-button--small" :disabled="!canAnswer || choice.length === 0">
          {{ t.quiz.submit }}
        </button>
        <template v-if="presenter && status === 'active'">
          <button v-if="!open" type="button" class="pm-ui-button pm-ui-button--primary pm-ui-button--small" @click="setOpen(true)">
            {{ t.quiz.openButton }}
          </button>
          <button v-else type="button" class="pm-ui-button pm-ui-button--small" @click="setOpen(false)">
            {{ t.quiz.closeButton }}
          </button>
        </template>
      </p>
    </form>
    <p class="pm-classroom-status" role="status">
      {{ statusText }}
    </p>
    <p v-if="showTally" class="pm-quiz__tally">
      {{ t.quiz.tally(result.respondents, result.correct) }}
    </p>
    <p v-if="presenter && late.length" class="pm-quiz__late">
      {{ t.quiz.late(late.length) }}
    </p>
    <p v-if="failure" class="pm-classroom-error" role="alert">
      {{ failure }}
    </p>
  </div>
</template>

<style scoped>
.pm-quiz__options {
  display: grid;
  gap: 0.4em;
  margin: 0.6em 0;
  padding: 0;
  list-style: none;
}
.pm-quiz__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5em;
  margin: 0;
  padding: 0.35em 0.75em;
  border: 1px solid var(--pm-color-line);
  border-radius: var(--pm-radius-control);
  background: var(--pm-color-surface);
}
.pm-quiz__option label {
  display: flex;
  align-items: center;
  gap: 0.5em;
  cursor: pointer;
}
.pm-quiz__option[data-correct] {
  border-color: var(--pm-color-ok);
  background: var(--pm-color-ok-soft);
}
.pm-quiz__option[data-correct] .pm-quiz__letter {
  color: var(--pm-color-ok);
}
.pm-quiz__letter {
  color: var(--pm-color-accent);
  font-family: var(--pm-font-mono);
  font-weight: 600;
}
.pm-quiz__count {
  font-variant-numeric: tabular-nums;
}
.pm-quiz__tally {
  margin: 0.25rem 0 0;
  font-weight: 600;
}
</style>
