<script setup lang="ts">
// The classroom: its state, creating or joining it, the join link and QR code, the participants, ending and archiving it.
// Shown in the presenter panels of both forms and from the toolbar.
import { renderSVG } from 'uqr'
import { computed, ref } from 'vue'
import { statusText } from '../domain/index.ts'
import { useClassroom } from './use.ts'

const { session, snapshot } = useClassroom()
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
    failure.value = error instanceof Error ? error.message : String(error)
  } finally {
    busy.value = false
  }
}

function submit(): void {
  const room = snapshot.value?.invitation
  void run(s => (room ? s.join(room, name.value) : s.create(name.value)))
}
</script>

<template>
  <div v-if="snapshot" class="pm-session" :data-status="snapshot.status" :data-connection="snapshot.connection">
    <p class="pm-session__status" role="status">
      {{ statusText(snapshot) }}
    </p>
    <p v-if="!snapshot.server" class="pm-session__hint">
      文稿照常放映与阅读。要开课，启动 <code>presmium-classroom-server</code>，并在文稿 frontmatter 中设置 <code>presmium.session.server</code>。
    </p>
    <form v-else-if="snapshot.status === 'idle'" class="pm-session__form" @submit.prevent="submit">
      <input v-model="name" aria-label="昵称" placeholder="昵称" maxlength="40" required>
      <button type="submit" :disabled="busy">
        {{ snapshot.invitation ? '加入课堂' : '创建课堂' }}
      </button>
    </form>
    <template v-else>
      <p>
        课堂 <code class="pm-session__room">{{ snapshot.sessionId }}</code> · {{ snapshot.me?.name }}（{{ presenter ? '主讲' : '学习者' }}）
      </p>
      <template v-if="presenter && snapshot.status === 'active' && snapshot.joinUrl">
        <p class="pm-session__join">
          加入链接：<a class="pm-session__link" :href="snapshot.joinUrl" target="_blank" rel="noopener">{{ snapshot.joinUrl }}</a>
        </p>
        <!-- eslint-disable-next-line vue/no-v-html -- an SVG generated from the link -->
        <div class="pm-session__qr" role="img" aria-label="加入课堂的二维码" v-html="qr" />
      </template>
      <p class="pm-session__label">
        参与者（{{ snapshot.participants.length }}）
      </p>
      <ul class="pm-session__participants" aria-label="参与者">
        <li v-for="p in snapshot.participants" :key="p.id" :data-role="p.role">
          {{ p.name }}<span v-if="p.role === 'presenter'">（主讲）</span>
        </li>
      </ul>
      <p class="pm-session__actions">
        <button v-if="presenter && snapshot.status === 'active'" type="button" :disabled="busy" @click="run(s => s.end())">
          结束课堂
        </button>
        <button v-if="presenter && snapshot.status === 'ended' && !snapshot.archive" type="button" :disabled="busy" title="把课堂记录写入文稿目录，并从课堂服务中释放" @click="run(s => s.archive())">
          归档课堂
        </button>
        <button type="button" @click="session?.leave()">
          离开课堂
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
  gap: 0.4rem;
  font-size: 0.85rem;
  line-height: 1.4;
}
.pm-session p {
  margin: 0;
}
.pm-session__status {
  font-weight: 600;
}
.pm-session__hint {
  opacity: 0.8;
}
.pm-session__form,
.pm-session__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.pm-session input,
.pm-session button {
  padding: 0.15rem 0.5rem;
  border: 1px solid rgba(125, 125, 125, 0.5);
  border-radius: 0.25rem;
  background: transparent;
  color: inherit;
  font: inherit;
}
.pm-session button {
  cursor: pointer;
}
.pm-session button:disabled {
  opacity: 0.5;
  cursor: default;
}
.pm-session__link {
  word-break: break-all;
}
.pm-session__qr {
  width: 8rem;
  height: 8rem;
  padding: 0.25rem;
  background: #fff;
  color: #000;
}
.pm-session__qr :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}
.pm-session__label {
  opacity: 0.8;
}
.pm-session__participants {
  margin: 0;
  padding-left: 1.2em;
}
.pm-session__error {
  color: #dc2626;
}
</style>
