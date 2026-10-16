<script setup lang="ts">
import { useMessages, useService } from '@presmium/host'
import { EXECUTOR } from '@presmium/kernel'
import { computed, ref, shallowRef } from 'vue'
import { useClassroomStore, useCollection, useSession } from '../src/client/use.ts'
import { checkReport, checkRequest, COLLECTIONS, isSubmission, MESSAGES, placeKey, reportKinds, submissionId, summarize, summaryText } from '../src/domain/index.ts'
import type { CheckError, CheckReport, Place, Submission } from '../src/domain/index.ts'
import '../src/client/style.css'

// P-65, from `{exercise}`: the prompt is the default slot. The learner edits the starter code and
// submits; the checks run through the `executor` service (Pyodide in the browser) and each failing
// check is marked with its typical error. In an active classroom the result also goes to the
// presenter, who sees how many passed and the most common errors. Once the classroom has ended, a
// learner's check result stays on their screen and says so.
const props = withDefaults(defineProps<{
  lang?: string
  starter?: string
  checks?: string
  /** Run timeout in ms; the executor's default when omitted. */
  timeout?: number
  place?: Place
}>(), { lang: 'python', starter: '', checks: '' })

const executor = useService(EXECUTOR)
const t = useMessages(MESSAGES)
const { me, status, joined, presenter } = useSession()
const store = useClassroomStore()
const submissions = useCollection(() => store.value, COLLECTIONS.submissions, isSubmission)

const id = computed(() => (props.place ? placeKey(props.place) : ''))
const code = ref(props.starter)
const running = ref(false)
const report = shallowRef<CheckReport>()
/** The executor that ran the last check. */
const ranBy = ref('')
const summary = computed(() => summarize(submissions.value.map(item => item.value).filter(s => s.exercise === id.value)))
/** A learner's results no longer reach the presenter. */
const ended = computed(() => joined.value && !presenter.value && status.value !== 'active')

const verdict = computed(() => {
  const r = report.value
  const { exercise } = t.value
  if (!r) return ''
  if (r.status === 'passed') return exercise.passed(r.passed, r.total)
  if (r.status === 'failed') return exercise.failed(r.total - r.passed, r.total)
  return exercise.notRun(r.error?.kind ?? '')
})

const describe = (error: CheckError) => t.value.exercise.error(error.hint, error.type, error.message, error.line)

async function submit(): Promise<void> {
  if (!executor.value || running.value) return
  running.value = true
  try {
    const run = await executor.value.run(checkRequest(code.value, props.checks, props.timeout))
    const result = checkReport(run, t.value)
    report.value = result
    ranBy.value = run.executorId
    const participant = me.value
    // The presenter sees the last submission of every learner of an active classroom.
    if (store.value && participant && !presenter.value && status.value === 'active' && props.place) {
      store.value.put<Submission>(COLLECTIONS.submissions, submissionId(id.value, participant.id), {
        ...props.place,
        exercise: id.value,
        participant: participant.id,
        name: participant.name,
        status: result.status,
        passed: result.passed,
        total: result.total,
        kinds: reportKinds(result),
        at: Date.now(),
      })
    }
  } finally {
    running.value = false
  }
}
</script>

<template>
  <div class="pm-exercise pm-classroom-card" :data-exercise="id" :data-status="running ? 'running' : report?.status ?? 'idle'">
    <div class="pm-exercise__prompt">
      <slot />
    </div>
    <form @submit.prevent="submit">
      <textarea
        v-model="code"
        class="pm-exercise__code"
        :aria-label="t.exercise.code"
        spellcheck="false"
        autocomplete="off"
        :rows="Math.min(12, code.split('\n').length + 1)"
        @keydown.stop
      />
      <details class="pm-exercise__checks">
        <summary>{{ t.exercise.checks }}</summary>
        <pre>{{ checks }}</pre>
      </details>
      <p class="pm-classroom-actions">
        <button type="submit" :disabled="running || !executor">
          {{ running ? t.exercise.checking : t.exercise.submit }}
        </button>
        <span v-if="!executor" class="pm-classroom-error">{{ t.exercise.noExecutor }}</span>
      </p>
      <p v-if="ended" class="pm-classroom-status pm-exercise__ended">
        {{ t.exercise.ended }}
      </p>
    </form>
    <div v-if="report" class="pm-exercise__report" :data-executor="ranBy">
      <p class="pm-exercise__verdict" role="status" :data-status="report.status">
        {{ verdict }}
      </p>
      <p v-if="report.error" class="pm-exercise__error" :data-kind="report.error.kind">
        <strong>{{ report.error.kind }}</strong>{{ t.colon }}{{ describe(report.error) }}
      </p>
      <ol class="pm-exercise__cases">
        <li v-for="item in report.cases" :key="item.line" :data-ok="item.ok">
          <span aria-hidden="true">{{ item.ok ? '✓' : '✗' }}</span>
          <code>{{ item.code }}</code>
          <p v-if="item.error" class="pm-exercise__error" :data-kind="item.error.kind">
            <strong>{{ item.error.kind }}</strong>{{ t.colon }}{{ describe(item.error) }}
          </p>
        </li>
      </ol>
      <pre v-if="report.output.trim()" class="pm-exercise__output">{{ report.output }}</pre>
    </div>
    <p v-if="presenter" class="pm-exercise__summary">
      {{ summaryText(summary, t) }}
    </p>
  </div>
</template>

<style scoped>
.pm-exercise__code {
  min-height: 4rem;
  padding: 0.35rem 0.5rem;
  font-size: 0.85em;
  line-height: 1.4;
  resize: vertical;
}
.pm-exercise__checks pre,
.pm-exercise__output {
  margin: 0.25rem 0;
  padding: 0.35rem 0.5rem;
  max-height: 8rem;
  overflow: auto;
  border-radius: 0.25rem;
  background: rgba(125, 125, 125, 0.12);
  font-size: 0.8em;
  white-space: pre-wrap;
}
.pm-exercise__verdict {
  font-weight: 600;
}
.pm-exercise__verdict[data-status='passed'] {
  color: #16a34a;
}
.pm-exercise__verdict[data-status='failed'],
.pm-exercise__verdict[data-status='error'] {
  color: #dc2626;
}
.pm-exercise__cases {
  margin: 0.25rem 0;
  padding-left: 1.2em;
}
.pm-exercise__cases li[data-ok='false'] > span {
  color: #dc2626;
}
.pm-exercise__error {
  font-size: 0.9em;
}
.pm-exercise__summary {
  font-weight: 600;
}
</style>
