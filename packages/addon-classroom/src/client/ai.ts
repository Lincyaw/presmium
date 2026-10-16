/**
 * AI answers to the classroom's questions (P-112, design-v0.7 5.4): where a
 * Presmium server's assistant serves the presenter's window (`AGENT`), the
 * question list offers an "AI answer" naming the model's provider (N-08).
 * The answer is a draft in the presenter's window until the presenter sends
 * it to the classroom, as the question's `reply`; learners never reach the
 * agent themselves.
 */
import { useService } from '@presmium/host'
import { AGENT, errorMessage } from '@presmium/kernel'
import type { AgentTask } from '@presmium/kernel'
import { computed, reactive } from 'vue'
import type { Question } from '../domain/index.ts'

export interface Draft {
  state: 'running' | 'ready' | 'failed'
  text: string
  error?: string
  provider?: string
  task: AgentTask
}

/** An answer's citations of the deck (`[label](presmium://…)`) as their labels: the classroom gets plain text. */
const plain = (text: string) => text.replace(/\[([^\]\n]+)\]\(presmium:\/\/[^)\s]+\)/g, '$1').trim()

export function useAiAnswers() {
  const agent = useService(AGENT)
  /** The provider, while the assistant answers questions here. */
  const provider = computed(() => (agent.value?.available('question') ? agent.value.provider() : undefined))
  const drafts = reactive(new Map<string, Draft>())

  function answer(id: string, question: Question): void {
    const client = agent.value
    if (!client || drafts.has(id)) return
    const task = client.submit({ kind: 'question', prompt: question.text, context: { document: '', section: question.section, ...question.block ? { block: question.block } : {} } })
    drafts.set(id, { state: 'running', text: '', provider: client.provider(), task })
    const draft = drafts.get(id)!
    void (async () => {
      const texts: string[] = []
      try {
        for await (const event of task.events) {
          if (event.type === 'message') texts.push(plain(event.text))
          else if (event.type === 'error') throw new Error(event.message)
        }
        draft.text = texts.filter(Boolean).join('\n\n')
        draft.state = draft.text ? 'ready' : 'failed'
      } catch (error) {
        draft.state = 'failed'
        draft.error = errorMessage(error)
      }
    })()
  }

  function discard(id: string): void {
    drafts.get(id)?.task.cancel()
    drafts.delete(id)
  }

  return { provider, drafts, answer, discard }
}
