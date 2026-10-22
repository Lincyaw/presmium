<script setup lang="ts">
import { useMessages } from '@lincyaw/host'
import { computed } from 'vue'
import { MESSAGES } from '../domain/index.ts'
import type { Question } from '../domain/index.ts'
import type { AiAnswers } from './ai-answers.ts'
import './style.css'

const props = defineProps<{
  question: Question & { id: string }
  active: boolean
  ai: AiAnswers
}>()
const emit = defineEmits<{ toggleAnswered: [], send: [] }>()

const t = useMessages(MESSAGES)
const draft = computed(() => props.ai.drafts.get(props.question.id))
</script>

<template>
  <li class="pm-classroom-question" :data-answered="question.answered ? '' : undefined">
    <strong>{{ question.name }}</strong>{{ t.colon }}{{ question.text }}
    <button v-if="active" type="button" class="pm-ui-button pm-ui-button--small" @click="emit('toggleAnswered')">
      {{ question.answered ? t.questions.markUnanswered : t.questions.markAnswered }}
    </button>
    <button v-if="active && ai.provider.value && !question.reply && !draft" type="button" class="pm-classroom-panel__ai pm-ui-button pm-ui-button--small" :title="t.questions.aiTitle(ai.provider.value)" @click="ai.draftReply(question.id, question)">
      {{ t.questions.ai(ai.provider.value) }}
    </button>
    <div v-if="draft" class="pm-classroom-panel__draft" :data-state="draft.state">
      <p v-if="draft.state === 'running'" class="pm-classroom-status" role="status">
        {{ t.questions.aiAnswering }}
      </p>
      <template v-else-if="draft.state === 'ready'">
        <p class="pm-classroom-status">
          {{ t.questions.aiDraft }}
        </p>
        <p class="pm-classroom-panel__answer">
          {{ draft.text }}
        </p>
      </template>
      <p v-else class="pm-classroom-error" role="alert">
        {{ t.questions.aiFailed(draft.error ?? '') }}
      </p>
      <p class="pm-classroom-actions">
        <button v-if="draft.state === 'ready'" type="button" class="pm-ui-button pm-ui-button--primary pm-ui-button--small" @click="emit('send')">
          {{ t.questions.send }}
        </button>
        <button type="button" class="pm-ui-button pm-ui-button--small" @click="ai.discard(question.id)">
          {{ t.questions.discard }}
        </button>
      </p>
    </div>
    <p v-if="question.reply" class="pm-classroom-reply">
      {{ question.reply.provider ? t.questions.reply(question.reply.provider) : '' }}{{ question.reply.text }}
    </p>
  </li>
</template>

<style scoped>
.pm-classroom-question p {
  margin: 0;
}
.pm-classroom-question > .pm-ui-button {
  margin-left: 0.35rem;
}
.pm-classroom-question[data-answered] {
  color: var(--pm-color-muted);
}
.pm-classroom-panel__draft {
  margin: 0.35rem 0;
  padding: 0.35rem 0.75rem;
  border-left: 3px solid var(--pm-color-line-strong);
}
.pm-classroom-panel__answer {
  white-space: pre-wrap;
}
</style>
