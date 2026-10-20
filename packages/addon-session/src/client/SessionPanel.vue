<script setup lang="ts">
import { useMessages } from '@lincyaw/host'
import { errorMessage } from '@lincyaw/kernel'
import { renderSVG } from 'uqr'
import { computed, ref } from 'vue'
import { loopbackLink, MESSAGES, statusText } from '../domain/index.ts'
import { releaseFocus, useClassroom } from './use.ts'

const { session, snapshot } = useClassroom()
const t = useMessages(MESSAGES)
const name = ref('')
const busy = ref(false)
const failure = ref('')

const presenter = computed(() => snapshot.value?.me?.role === 'presenter')
const qr = computed(() => (snapshot.value?.joinUrl ? renderSVG(snapshot.value.joinUrl, { border: 1 }) : ''))

async function run(action: (s: NonNullable<typeof session.value>) => unknown): Promise<void> {
  if (!session.value || busy.value) return
  busy.value = true
  failure.value = ''
  try {
    await action(session.value)
  } catch (error) {
    failure.value = errorMessage(error)
  } finally {
    busy.value = false
  }
}

function submit(): void {
  const room = snapshot.value?.invitation
  releaseFocus()
  void run(s => (room ? s.join(room, name.value) : s.create(name.value)))
}
</script>

<template>
  <div v-if="snapshot" class="pm-session" :data-status="snapshot.status" :data-connection="snapshot.connection">
    <p class="pm-session__status" role="status">
      {{ statusText(snapshot, t) }}
    </p>
    <p v-if="!snapshot.server" class="pm-session__hint">
      {{ t.hint[0] }}<code>presmium-classroom-server</code>{{ t.hint[1] }}<code>presmium.session.server</code>{{ t.hint[2] }}
    </p>
    <template v-else-if="snapshot.status === 'idle'">
      <p v-if="snapshot.rejoin" class="pm-session__actions">
        <button type="button" class="pm-ui-button pm-ui-button--primary pm-ui-button--small" :disabled="busy" :title="t.rejoinTitle" @click="run(s => s.rejoin())">
          {{ t.rejoin(snapshot.rejoin) }}
        </button>
      </p>
      <form class="pm-session__form" @submit.prevent="submit">
        <input v-model="name" class="pm-ui-input" :aria-label="t.nickname" :placeholder="t.nickname" maxlength="40" required>
        <button type="submit" class="pm-ui-button pm-ui-button--primary pm-ui-button--small" :disabled="busy">
          {{ snapshot.invitation ? t.join : t.create }}
        </button>
      </form>
    </template>
    <template v-else>
      <p>
        {{ t.classroom }} <code class="pm-session__room pm-ui-code">{{ snapshot.sessionId }}</code> · {{ snapshot.me?.name }}{{ presenter ? t.role.presenter : t.role.learner }}
      </p>
      <template v-if="presenter && snapshot.status === 'active' && snapshot.joinUrl">
        <p class="pm-session__join">
          {{ t.joinLink }}<a class="pm-session__link pm-ui-link" :href="snapshot.joinUrl" target="_blank" rel="noopener">{{ snapshot.joinUrl }}</a>
        </p>
        <p v-if="loopbackLink(snapshot.joinUrl)" class="pm-session__warning" role="note">
          {{ t.loopbackLink }}
        </p>
        <div class="pm-session__qr" role="img" :aria-label="t.qr" v-html="qr" />
      </template>
      <p class="pm-session__label pm-ui-heading">
        {{ t.participantCount(snapshot.participants.length) }}
      </p>
      <ul class="pm-session__participants" :aria-label="t.participants">
        <li v-for="p in snapshot.participants" :key="p.id" :data-role="p.role">
          {{ p.name }}<span v-if="p.role === 'presenter'">{{ t.role.presenter }}</span>
        </li>
      </ul>
      <p class="pm-session__actions">
        <button v-if="presenter && snapshot.status === 'active'" type="button" class="pm-ui-button pm-ui-button--danger pm-ui-button--small" :disabled="busy" @click="run(s => s.end())">
          {{ t.end }}
        </button>
        <button v-if="presenter && snapshot.status === 'ended' && !snapshot.archive" type="button" class="pm-ui-button pm-ui-button--small" :disabled="busy" :title="t.archiveTitle" @click="run(s => s.archive())">
          {{ t.archive }}
        </button>
        <button type="button" class="pm-ui-button pm-ui-button--small" @click="session?.leave()">
          {{ t.leaveClassroom }}
        </button>
      </p>
    </template>
    <p v-if="failure" class="pm-session__error" role="alert">
      {{ failure }}
    </p>
  </div>
</template>

<style scoped>
.pm-session {
  display: grid;
  gap: 0.5rem;
  color: var(--pm-color-ink);
  font-family: var(--pm-font-sans);
  font-size: var(--pm-text-md);
  line-height: var(--pm-leading-ui);
}
.pm-session p {
  margin: 0;
}
.pm-session__status {
  font-weight: 600;
}
.pm-session__hint {
  color: var(--pm-color-muted);
}
.pm-session__form,
.pm-session__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.pm-session__form .pm-ui-input {
  flex: 1;
  min-width: 8rem;
}
.pm-session__link {
  word-break: break-all;
}
.pm-session__qr {
  width: 8rem;
  height: 8rem;
  padding: 0.25rem;
  border-radius: var(--pm-radius-small);
  background: #fff;
  color: #000;
}
.pm-session__qr :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}
.pm-session__participants {
  margin: 0;
  padding-left: 1.2em;
}
.pm-session__participants span {
  color: var(--pm-color-muted);
}
.pm-session__error,
.pm-session__warning {
  color: var(--pm-color-danger);
}
</style>
