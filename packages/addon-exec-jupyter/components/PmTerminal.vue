<script setup lang="ts">
import { useMessages, useService } from '@presmium/host'
import { errorMessage } from '@presmium/kernel'
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import '@xterm/xterm/css/xterm.css'
import { MESSAGES } from '../src/client/messages.ts'
import { DEFAULT_TERMINAL_ROWS, JUPYTER_ENVIRONMENTS } from '../src/domain/index.ts'
import type { TerminalSession } from '../src/domain/service.ts'

const props = withDefaults(defineProps<{
  env: string
  rows?: number
}>(), { rows: DEFAULT_TERMINAL_ROWS })

const environments = useService(JUPYTER_ENVIRONMENTS)
const t = useMessages(MESSAGES)
const screen = ref<HTMLElement>()
const state = ref<'idle' | 'connecting' | 'open' | 'closed' | 'failed'>('idle')
const failure = ref<string>()
const unavailable = computed(() => environments.value?.unavailable(props.env))

let session: TerminalSession | undefined
let dispose: (() => void) | undefined

async function open() {
  const service = environments.value
  if (!service || !screen.value || state.value === 'connecting' || state.value === 'open') return
  close()
  state.value = 'connecting'
  failure.value = undefined
  await nextTick()
  const [{ Terminal }, { FitAddon }] = await Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')])
  const terminal = new Terminal({ rows: props.rows, cursorBlink: true, fontSize: 14, convertEol: false })
  const fit = new FitAddon()
  terminal.loadAddon(fit)
  terminal.open(screen.value!)
  const resize = () => {
    const columns = fit.proposeDimensions()?.cols
    if (columns && columns !== terminal.cols) terminal.resize(columns, props.rows)
    session?.resize(props.rows, terminal.cols)
  }
  resize()
  const observer = new ResizeObserver(resize)
  observer.observe(screen.value!)
  dispose = () => {
    observer.disconnect()
    terminal.dispose()
  }
  try {
    session = await service.openTerminal(props.env, {
      output: data => terminal.write(data),
      closed: () => {
        state.value = 'closed'
      },
    })
  } catch (error) {
    close()
    failure.value = errorMessage(error)
    state.value = 'failed'
    return
  }
  terminal.onData(data => session?.send(data))
  session.resize(props.rows, terminal.cols)
  state.value = 'open'
  terminal.focus()
}

function close() {
  void session?.close()
  session = undefined
  dispose?.()
  dispose = undefined
}

onBeforeUnmount(close)
</script>

<template>
  <div class="pm-terminal" :data-env="env" :data-state="unavailable ? 'unavailable' : state">
    <div class="pm-terminal__bar">
      <span class="pm-terminal__title">{{ t.terminal(env) }}</span>
      <button v-if="!unavailable && (state === 'idle' || state === 'closed' || state === 'failed')" type="button" class="pm-terminal__open pm-ui-button pm-ui-button--small" :disabled="!environments" @click="open">
        {{ state === 'idle' ? t.terminalOpen : t.terminalReconnect }}
      </button>
      <span v-if="state === 'connecting'" class="pm-terminal__status">{{ t.terminalConnecting }}</span>
      <span v-if="state === 'closed'" class="pm-terminal__status">{{ t.terminalClosed }}</span>
    </div>
    <p v-if="unavailable" class="pm-terminal__note">{{ unavailable }}</p>
    <p v-else-if="failure" class="pm-terminal__note" role="alert">{{ t.terminalFailed(failure) }}</p>
    <div v-show="!unavailable && (state === 'connecting' || state === 'open' || state === 'closed')" ref="screen" class="pm-terminal__screen" :aria-label="t.terminal(env)" />
  </div>
</template>

<style scoped>
.pm-terminal {
  --pm-text-sm: 0.875em;

  margin: 0.75rem 0;
  overflow: hidden;
  border: 1px solid var(--pm-color-line);
  border-radius: var(--pm-radius-panel);
  background: var(--pm-color-surface);
  color: var(--pm-color-ink);
  font-family: var(--pm-font-sans);
  text-align: left;
}
.pm-terminal__bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.4rem 0.9rem;
  border-bottom: 1px solid var(--pm-color-line);
  background: var(--pm-color-sunk);
  font-size: 0.85em;
}
.pm-terminal__title {
  font-family: var(--pm-font-mono);
  font-weight: 500;
}
.pm-terminal__open,
.pm-terminal__status {
  margin-left: auto;
}
.pm-terminal__status {
  color: var(--pm-color-muted);
}
.pm-terminal__note {
  margin: 0;
  padding: 0.5rem 0.9rem;
  font-size: 0.9em;
}
.pm-terminal__screen {
  padding: 0.25rem;
  background: #000;
}
</style>
