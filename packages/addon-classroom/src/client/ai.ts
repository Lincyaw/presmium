/**
 * AI answers to the classroom's questions (P-112, decision E-9): where the
 * assistant runs in the presenter's window, the question list offers an "AI
 * answer" naming the provider (N-08) of the presenter's own model service
 * (`ASK`, the one the presenter filled in for the question panel, asked from
 * the presenter's browser). The answer is a draft in the presenter's window
 * until the presenter sends it to the classroom, as the question's `reply`;
 * learners never reach the model themselves.
 */
import { useService } from '@presmium/host'
import { ASK, errorMessage } from '@presmium/kernel'
import { computed, reactive } from 'vue'
import type { Question } from '../domain/index.ts'

export interface Draft {
  state: 'running' | 'ready' | 'failed'
  text: string
  error?: string
  provider?: string
  stop: AbortController
}

/** An answer's citations of the deck (`[label](presmium://…)`) as their labels: the classroom gets plain text. */
const plain = (text: string) => text.replace(/\[([^\]\n]+)\]\(presmium:\/\/[^)\s]+\)/g, '$1').trim()

export function useAiAnswers() {
  const ask = useService(ASK)
  /** The assistant runs here: it offers AI answers once the presenter filled in a model service. */
  const offered = computed(() => Boolean(ask.value))
  /** The provider, once the presenter filled in a model service here. */
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
