<script setup lang="ts">
import { PmIcon, useMessages, usePresentationMode, useService } from '@presmium/host'
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
// On a slide (and in the present view) the code shows fewer lines and scrolls, so the card keeps to the slide (N-05).
const rows = usePresentationMode() === 'slides' ? 8 : 12
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
        class="pm-exercise__code pm-ui-textarea"
        :aria-label="t.exercise.code"
        spellcheck="false"
        autocomplete="off"
        :rows="Math.min(rows, code.split('\n').length + 1)"
        @keydown.stop
      />
      <details class="pm-exercise__checks">
        <summary>{{ t.exercise.checks }}</summary>
        <pre>{{ checks }}</pre>
      </details>
      <p class="pm-classroom-actions">
        <button type="submit" class="pm-ui-button pm-ui-button--primary pm-ui-button--small" :disabled="running || !executor">
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
          <PmIcon class="pm-exercise__mark" :name="item.ok ? 'check' : 'close'" size="1em" :stroke-width="2.2" />
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
  min-height: 4em;
  padding: 0.4em 0.75em;
  background: var(--pm-color-code);
  font-family: var(--pm-font-mono);
  font-size: 0.85em;
  line-height: 1.4;
}
.pm-exercise__checks {
  margin: 0.4em 0;
  color: var(--pm-color-muted);
}
.pm-exercise__checks summary {
  cursor: pointer;
}
.pm-exercise__checks pre,
.pm-exercise__output {
  margin: 0.35em 0;
  padding: 0.5em 0.75em;
  max-height: 8em;
  overflow: auto;
  border-radius: var(--pm-radius-control);
  background: var(--pm-color-sunk);
  color: var(--pm-color-ink);
  font-family: var(--pm-font-mono);
  font-size: 0.85em;
  white-space: pre-wrap;
}
.pm-exercise__verdict {
  font-weight: 600;
}
.pm-exercise__verdict[data-status='passed'] {
  color: var(--pm-color-ok);
}
.pm-exercise__verdict[data-status='failed'],
.pm-exercise__verdict[data-status='error'] {
  color: var(--pm-color-danger);
}
.pm-exercise__cases {
  margin: 0.35em 0;
  padding-left: 1.2em;
}
.pm-exercise__mark {
  margin-inline-end: 0.3em;
  vertical-align: -0.12em;
}
.pm-exercise__cases li[data-ok='true'] > .pm-exercise__mark {
  color: var(--pm-color-ok);
}
.pm-exercise__cases li[data-ok='false'] > .pm-exercise__mark {
  color: var(--pm-color-danger);
}
.pm-exercise__error {
  font-size: 0.9em;
}
.pm-exercise__summary {
  font-weight: 600;
}
</style>
