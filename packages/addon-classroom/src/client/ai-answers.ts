import { useService } from '@lincyaw/host'
import { ASK, errorMessage } from '@lincyaw/kernel'
import { useEffect, useRef, useState } from 'react'
import type { Question } from '../domain/index.ts'
export interface Draft { state: 'running' | 'ready' | 'failed', text: string, error?: string, provider?: string, stop: AbortController }
const plainReply = (text: string) => text.replace(/\[([^\]\n]+)\]\(presmium:\/\/[^)\s]+\)/g, '$1').trim()
export function useAiAnswers() {
  const ask = useService(ASK)
  const [drafts, setDrafts] = useState(new Map<string, Draft>())
  const current = useRef(drafts); current.current = drafts
  const change = (id: string, draft?: Draft) => setDrafts(before => { const next = new Map(before); if (draft) next.set(id, draft); else next.delete(id); return next })
  useEffect(() => () => current.current.forEach(d => d.stop.abort()), [])
  function draftReply(id: string, question: Question): void {
    if (!ask || current.current.has(id)) return
    const stop = new AbortController()
    const draft: Draft = { state: 'running', text: '', provider: ask.provider(), stop }
    change(id, draft)
    void (async () => {
      let text = ''
      try {
        for await (const piece of ask.ask(question.text, { document: '', section: question.section, ...question.block ? { block: question.block } : {} }, stop.signal)) text += piece
        if (!stop.signal.aborted) change(id, { ...draft, text: plainReply(text), state: text.trim() ? 'ready' : 'failed' })
      } catch (error) { if (!stop.signal.aborted) change(id, { ...draft, state: 'failed', error: errorMessage(error) }) }
    })()
  }
  function discard(id: string) { current.current.get(id)?.stop.abort(); change(id) }
  return { offered: Boolean(ask), provider: ask?.provider(), drafts, draftReply, discard }
}
export type AiAnswers = ReturnType<typeof useAiAnswers>
