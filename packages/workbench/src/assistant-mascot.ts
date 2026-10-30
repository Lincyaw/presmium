// What the kitten beside the assistant does, from what the assistant is doing: asking the author to approve
// something, reading the document it was asked about, writing into it, thinking, just finished, or idle (sitting,
// then lying down, then asleep the longer nothing happens).
import { useEffect, useState } from 'react'
import type { MascotAction } from '@lincyaw/design/mascot'
import { useWorkbench, useWorkbenchState } from './context.tsx'

const DONE_MS = 2400
const LOAF_MS = 90_000
const SLEEP_MS = 300_000

export interface AssistantActivity {
  /** The assistant's turn is running. */
  running: boolean
  /** It holds a review of the open document: still working in it, and how many changes it has made. */
  review?: { running: boolean, changes: number }
  /** Operations wait for the author's approval. */
  approvals: number
  /** How long ago the assistant last stopped, in milliseconds (Infinity if it has not run). */
  sinceStopped: number
}

export function assistantMascotAction(a: AssistantActivity): MascotAction {
  if (a.approvals > 0) return 'ask'
  if (a.review?.running) return a.review.changes > 0 ? 'write' : 'read'
  if (a.running) return 'think'
  if (a.review && a.review.changes > 0) return 'ask'
  if (a.sinceStopped < DONE_MS) return 'done'
  if (a.sinceStopped > SLEEP_MS) return 'sleep'
  if (a.sinceStopped > LOAF_MS) return 'loaf'
  return 'sit'
}

/** The kitten's action for the assistant, given whether its turn is running; follows the workbench's review and the
 * operations waiting for approval, and moves on by itself as time passes. */
export function useAssistantMascot(running: boolean): MascotAction {
  const { client } = useWorkbench()
  // two plain values rather than one object, so the selection compares equal while nothing changes
  const reviewRunning = useWorkbenchState(state => state.review?.running)
  const changes = useWorkbenchState(state => state.review?.changes.length)
  const review = reviewRunning === undefined ? undefined : { running: reviewRunning, changes: changes ?? 0 }
  const [approvals, setApprovals] = useState<string[]>([])
  const [stoppedAt, setStoppedAt] = useState<number>(() => performance.now() - LOAF_MS / 2)
  const [, setNow] = useState(0)
  const busy = running || Boolean(review?.running)
  useEffect(() => client.subscribeApprovals(event => {
    if (event.type === 'reset') setApprovals([])
    else if (event.type === 'settled') setApprovals(list => list.filter(id => id !== event.id))
    else setApprovals(list => list.includes(event.id) ? list : [...list, event.id])
  }), [client])
  useEffect(() => { if (!busy) setStoppedAt(performance.now()) }, [busy])
  // Wake up at the next moment the idle kitten changes what it does.
  const since = performance.now() - stoppedAt
  useEffect(() => {
    if (busy) return
    const next = [DONE_MS, LOAF_MS, SLEEP_MS].find(ms => ms > since)
    if (next === undefined) return
    const timer = setTimeout(() => setNow(performance.now()), next - since + 50)
    return () => clearTimeout(timer)
  }, [busy, since])
  return assistantMascotAction({ running, review, approvals: approvals.length, sinceStopped: busy ? 0 : since })
}
