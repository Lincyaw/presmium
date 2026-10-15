<script setup lang="ts">
import { PmBoundary } from '@presmium/host'
import { computed, ref } from 'vue'
import { newId, useClassroomStore, useCollection, useSession, useWrite } from '../src/client/use.ts'
import { COLLECTIONS, placeText } from '../src/domain/index.ts'
import type { Place, Question } from '../src/domain/index.ts'
import '../src/client/style.css'

// P-66, from `{question-box}`: the prompt is the default slot. Learners of an active classroom ask
// here; a question is attached to this section, or to the block `target` names. The learner sees
// their own questions, the presenter every question asked here (the presenter view lists them all
// by place) and marks them answered.
const props = defineProps<{
  /** Id of a block of this section the questions are about. */
  target?: string
  place?: Place
}>()

const { me, status, joined, presenter } = useSession()
const store = useClassroomStore()
const questions = useCollection<Question>(() => store.value, COLLECTIONS.questions)
const { failure, write } = useWrite()
const text = ref('')

const where = computed(() => (props.place ? placeText({ ...props.place, block: props.target }) : ''))
const here = computed(() => questions.value
  .filter(({ value }) => value.section === props.place?.section && value.block === props.target)
  .sort((a, b) => a.value.at - b.value.at))
const shown = computed(() => (presenter.value ? here.value : here.value.filter(({ value }) => value.author === me.value?.id)))
const canAsk = computed(() => joined.value && !presenter.value && status.value === 'active')

function ask(): void {
  const participant = me.value
  const question = text.value.trim()
  if (!store.value || !participant || !props.place || !question) return
  const { section, title, index } = props.place
  const asked = write(() => store.value!.put<Question>(COLLECTIONS.questions, `${participant.id}:${newId()}`, {
    section,
    ...props.target ? { block: props.target } : {},
    title,
    index,
    text: question,
    author: participant.id,
    name: participant.name,
    at: Date.now(),
  }))
  if (asked) text.value = ''
}

function toggleAnswered(id: string, question: Question): void {
  write(() => store.value?.put<Question>(COLLECTIONS.questions, id, { ...question, answered: !question.answered }))
}
</script>

<template>
  <PmBoundary name="PmQuestionBox">
    <div class="pm-question-box pm-classroom-card" :data-place="where">
      <div class="pm-question-box__prompt">
        <slot />
      </div>
      <form v-if="canAsk" class="pm-question-box__form" @submit.prevent="ask">
        <textarea v-model="text" aria-label="问题" rows="2" maxlength="500" placeholder="写下你的问题" @keydown.stop />
        <p class="pm-classroom-actions">
          <button type="submit" :disabled="!text.trim()">
            提问
          </button>
          <span class="pm-classroom-status">问题挂在{{ where }}</span>
        </p>
      </form>
      <p v-else-if="!joined" class="pm-classroom-status">
        加入课堂后，可以在这里向主讲提问。
      </p>
      <p v-else-if="status !== 'active'" class="pm-classroom-status">
        课堂已结束，不再接受提问。
      </p>
      <ul v-if="shown.length" class="pm-question-box__list" :aria-label="presenter ? '这里的提问' : '我的提问'">
        <li v-for="item in shown" :key="item.id" :data-answered="item.value.answered ? '' : undefined">
          <span v-if="presenter" class="pm-question-box__name">{{ item.value.name }}：</span>{{ item.value.text }}
          <span v-if="item.value.answered" class="pm-question-box__answered">（已回答）</span>
          <button v-if="presenter && status === 'active'" type="button" @click="toggleAnswered(item.id, item.value)">
            {{ item.value.answered ? '标为未回答' : '标为已回答' }}
          </button>
        </li>
      </ul>
      <p v-if="failure" class="pm-classroom-error" role="alert">
        {{ failure }}
      </p>
    </div>
  </PmBoundary>
</template>

<style scoped>
.pm-question-box__list {
  margin: 0.25rem 0;
  padding-left: 1.2em;
}
.pm-question-box__list li[data-answered] {
  color: var(--vp-c-text-2, inherit);
}
.pm-question-box__name {
  font-weight: 600;
}
</style>
