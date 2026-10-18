<script setup lang="ts">
import { useMessages } from '@presmium/host'
import { computed, ref } from 'vue'
import { newId, useClassroomStore, useCollection, useSession, useWrite } from '../src/client/use.ts'
import { COLLECTIONS, isQuestion, MESSAGES, placeText } from '../src/domain/index.ts'
import type { Place, Question } from '../src/domain/index.ts'
import '../src/client/style.css'

const props = defineProps<{
  target?: string
  place?: Place
}>()

const { me, status, joined, presenter } = useSession()
const store = useClassroomStore()
const questions = useCollection(() => store.value, COLLECTIONS.questions, isQuestion)
const { failure, write } = useWrite()
const text = ref('')
const t = useMessages(MESSAGES)

const where = computed(() => (props.place ? placeText({ ...props.place, block: props.target }, t.value) : ''))
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
  <div class="pm-question-box pm-classroom-card" :data-place="where">
    <div class="pm-question-box__prompt">
      <slot />
    </div>
    <form v-if="canAsk" class="pm-question-box__form" @submit.prevent="ask">
      <textarea v-model="text" class="pm-ui-textarea" :aria-label="t.questions.question" rows="2" maxlength="500" :placeholder="t.questions.placeholder" @keydown.stop />
      <p class="pm-classroom-actions">
        <button type="submit" class="pm-ui-button pm-ui-button--primary pm-ui-button--small" :disabled="!text.trim()">
          {{ t.questions.ask }}
        </button>
        <span class="pm-classroom-status">{{ t.questions.attachedTo(where) }}</span>
      </p>
    </form>
    <p v-else-if="!joined" class="pm-classroom-status">
      {{ t.questions.joinFirst }}
    </p>
    <p v-else-if="status !== 'active'" class="pm-classroom-status">
      {{ t.questions.ended }}
    </p>
    <ul v-if="shown.length" class="pm-question-box__list" :aria-label="presenter ? t.questions.here : t.questions.mine">
      <li v-for="item in shown" :key="item.id" :data-answered="item.value.answered ? '' : undefined">
        <span v-if="presenter" class="pm-question-box__name">{{ item.value.name }}{{ t.colon }}</span>{{ item.value.text }}
        <span v-if="item.value.answered" class="pm-question-box__answered pm-ui-badge pm-ui-badge--ok">{{ t.questions.answered }}</span>
        <p v-if="item.value.reply" class="pm-classroom-reply">
          {{ item.value.reply.provider ? t.questions.reply(item.value.reply.provider) : '' }}{{ item.value.reply.text }}
        </p>
        <button v-if="presenter && status === 'active'" type="button" class="pm-ui-button pm-ui-button--small" @click="toggleAnswered(item.id, item.value)">
          {{ item.value.answered ? t.questions.markUnanswered : t.questions.markAnswered }}
        </button>
      </li>
    </ul>
    <p v-if="failure" class="pm-classroom-error" role="alert">
      {{ failure }}
    </p>
  </div>
</template>

<style scoped>
.pm-question-box__list {
  margin: 0.4em 0;
  padding-left: 1.2em;
}
.pm-question-box__list li {
  margin: 0.35em 0;
}
.pm-question-box__list li[data-answered] {
  color: var(--pm-color-muted);
}
.pm-question-box__name {
  font-weight: 600;
}
.pm-question-box__answered {
  margin-left: 0.5em;
}
</style>
