import { useService } from '@lincyaw/host'
import { ASK, errorMessage } from '@lincyaw/kernel'
import { computed, reactive } from 'vue'
import type { Question } from '../domain/index.ts'

export interface Draft {
  state: 'running' | 'ready' | 'failed'
  text: string
  error?: string
  provider?: string
  stop: AbortController
}

const plain = (text: string) => text.replace(/\[([^\]\n]+)\]\(presmium:\/\/[^)\s]+\)/g, '$1').trim()

export function useAiAnswers() {
  const ask = useService(ASK)
  const offered = computed(() => Boolean(ask.value))
  const provider = computed(() => ask.value?.provider())
  const drafts = reactive(new Map<string, Draft>())

  function answer(id: string, question: Question): void {
    const client = ask.value
    if (!client || drafts.has(id)) return
    const stop = new AbortController()
    drafts.set(id, { state: 'running', text: '', provider: client.provider(), stop })
    const draft = drafts.get(id)!
    void (async () => {
      let text = ''
      try {
        for await (const piece of client.ask(question.text, { document: '', section: question.section, ...question.block ? { block: question.block } : {} }, stop.signal)) text += piece
        draft.text = plain(text)
        draft.state = draft.text ? 'ready' : 'failed'
      } catch (error) {
        if (stop.signal.aborted) return
        draft.state = 'failed'
        draft.error = errorMessage(error)
      }
    })()
  }

  function discard(id: string): void {
    drafts.get(id)?.stop.abort()
    drafts.delete(id)
  }

  return { offered, provider, drafts, answer, discard }
}
