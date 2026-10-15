<script setup lang="ts">
import { PmBoundary } from '@presmium/host'
import { computed, ref, useId, watch } from 'vue'
import { useClassroomStore, useCollection, useSession, useWrite } from '../src/client/use.ts'
import { acceptsAnswers, answerId, COLLECTIONS, countedAnswers, isCorrect, lateAnswers, optionLetter, placeKey, quizSwitched, tally } from '../src/domain/index.ts'
import type { Answer, Place, QuizState } from '../src/domain/index.ts'
import '../src/client/style.css'

// P-64, from `{quiz}`: the prompt is the default slot. In a classroom the presenter opens and closes
// the quiz and sees the tally as answers come in; learners answer while it is open, and answering
// again replaces their answer. Once it is closed everyone sees the tally and the right options; the
// result is frozen at closing, so an answer that reaches the room later does not count.
// Outside a classroom it is a self-test that tells at once whether an answer is right.
const props = defineProps<{
  options: string[]
  /** Indexes of the right options. */
  answer: number[]
  /** Set by the compiler. */
  place?: Place
}>()

const { me, status, joined, presenter } = useSession()
const store = useClassroomStore()
const quizzes = useCollection<QuizState>(() => store.value, COLLECTIONS.quizzes)
const answers = useCollection<Answer>(() => store.value, COLLECTIONS.answers)
const { failure, write } = useWrite()
const name = useId()

const id = computed(() => (props.place ? placeKey(props.place) : ''))
const state = computed(() => quizzes.value.find(item => item.id === id.value)?.value)
const counted = computed(() => countedAnswers(id.value, state.value, answers.value.map(item => item.value)))
const late = computed(() => lateAnswers(id.value, state.value, answers.value.map(item => item.value)))
const result = computed(() => tally(props.options.length, props.answer, counted.value))
const multiple = computed(() => props.answer.length > 1)
const open = computed(() => acceptsAnswers(status.value, state.value))
const closed = computed(() => state.value?.open === false)
/** This learner's last answer, and the one that counts: once the quiz is closed, the one it was closed with. */
const submitted = computed(() => (me.value ? answers.value.find(item => item.id === answerId(id.value, me.value!.id))?.value : undefined))
const mine = computed(() => (closed.value ? counted.value.find(a => a.participant === me.value?.id) : submitted.value))

const choice = ref<number[]>([])
/** The self-test answer outside a classroom. */
const tried = ref<number[]>()
// A learner sees their answer again, e.g. after a reload, and once the quiz is closed, the one that counted.
watch([mine, closed], ([answer]) => {
  if (answer && (closed.value || choice.value.length === 0)) choice.value = [...answer.choice]
}, { immediate: true })

const canAnswer = computed(() => (joined.value ? !presenter.value && open.value : true))
const showTally = computed(() => joined.value && (presenter.value || closed.value))
// Not before the quiz is closed, not even on the presenter's screen, which the room may see.
const revealed = computed(() => (joined.value ? closed.value : tried.value !== undefined))
const letters = (choice: number[]) => choice.map(optionLetter).join('、')

const statusText = computed(() => {
  if (!joined.value) {
    if (!tried.value) return '自测：选择后提交，立即看到对错'
    return isCorrect(tried.value, props.answer) ? '回答正确' : `回答错误，正确答案是 ${letters(props.answer)}`
  }
  if (presenter.value) return open.value ? '作答中' : closed.value ? '作答已关闭' : status.value === 'active' ? '尚未开放作答' : '课堂已结束'
  if (closed.value) {
    const verdict = mine.value ? `，你的答案${isCorrect(mine.value.choice, props.answer) ? '正确' : '错误'}` : ''
    return `作答已关闭${verdict}${late.value.some(a => a.participant === me.value?.id) ? '；关闭后送达的作答未计入' : ''}`
  }
  if (status.value !== 'active') return '课堂已结束'
  if (!open.value) return '等待主讲开放作答'
  return submitted.value ? `已提交 ${letters(submitted.value.choice)}，作答关闭前可以修改` : '作答中：选择后提交'
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
  <PmBoundary name="PmQuiz">
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
              <input :type="multiple ? 'checkbox' : 'radio'" :name="name" :checked="choice.includes(i)" :disabled="!canAnswer" @change="toggle(i)">
              <span class="pm-quiz__letter">{{ optionLetter(i) }}</span>
              <span>{{ option }}</span>
            </label>
            <span v-if="showTally" class="pm-quiz__count">{{ result.counts[i] }} 人</span>
          </li>
        </ol>
        <p class="pm-classroom-actions">
          <button v-if="!presenter" type="submit" :disabled="!canAnswer || choice.length === 0">
            提交
          </button>
          <template v-if="presenter && status === 'active'">
            <button v-if="!open" type="button" @click="setOpen(true)">
              开放作答
            </button>
            <button v-else type="button" @click="setOpen(false)">
              关闭作答
            </button>
          </template>
        </p>
      </form>
      <p class="pm-classroom-status" role="status">
        {{ statusText }}
      </p>
      <p v-if="showTally" class="pm-quiz__tally">
        已作答 {{ result.respondents }} 人，答对 {{ result.correct }} 人
      </p>
      <p v-if="presenter && late.length" class="pm-quiz__late">
        关闭后送达的作答 {{ late.length }} 份，未计入
      </p>
      <p v-if="failure" class="pm-classroom-error" role="alert">
        {{ failure }}
      </p>
    </div>
  </PmBoundary>
</template>

<style scoped>
.pm-quiz__options {
  margin: 0.5rem 0;
  padding: 0;
  list-style: none;
}
.pm-quiz__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin: 0.2rem 0;
  padding: 0.2rem 0.5rem;
  border: 1px solid rgba(125, 125, 125, 0.3);
  border-radius: 0.25rem;
}
.pm-quiz__option label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  cursor: pointer;
}
.pm-quiz__option[data-correct] {
  border-color: #16a34a;
  background: rgba(22, 163, 74, 0.1);
}
.pm-quiz__letter {
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
