import { pushStream, sseResponse, problemResponse, randomUUID } from '@lincyaw/kernel'
import type { AgentActivity, AgentActivityObserver, AgentActivitySnapshot, Route } from '@lincyaw/kernel'

/** One workspace lifetime, bounded observations, and member-scoped readers on the existing event transport. */
export function createAgentActivity() {
  const entries = new Map<string, { member: string, value: AgentActivity, timer: ReturnType<typeof setTimeout> }>()
  const readers = new Set<{ member: string, send(snapshot: AgentActivitySnapshot): void, end(): void }>()
  let closed = false
  const snapshot = (member: string): AgentActivitySnapshot => ({ activities: [...entries.values()].filter(entry => entry.member === member).map(entry => structuredClone(entry.value)) })
  const publish = (member: string) => { for (const reader of readers) if (reader.member === member) reader.send(snapshot(member)) }
  const remove = (id: string) => {
    const entry = entries.get(id)
    if (!entry) return
    clearTimeout(entry.timer); entries.delete(id); publish(entry.member)
  }
  const service: AgentActivityObserver = {
    begin(input, member) {
      if (closed) return () => {}
      if (entries.size >= 64) remove(entries.keys().next().value!)
      const id = randomUUID(), value: AgentActivity = { ...structuredClone(input), id, state: 'running', startedAt: Date.now() }
      const entry = { member: member.id, value, timer: setTimeout(() => remove(id), 600_000) }
      entry.timer.unref(); entries.set(id, entry); publish(member.id)
      return state => {
        if (closed || entries.get(id) !== entry || entry.value.state !== 'running') return
        clearTimeout(entry.timer)
        entry.value = { ...entry.value, state, finishedAt: Date.now() }
        entry.timer = setTimeout(() => remove(id), 6000); entry.timer.unref(); publish(member.id)
      }
    },
  }
  const route: Route = { role: 'owner', handle: async (request, ctx) => {
    if (request.method !== 'GET') return problemResponse(405, 'GET')
    if (closed) return problemResponse(503, 'agent-activity-closed')
    const stream = pushStream<{ event: string, data: AgentActivitySnapshot }>(push => {
      const reader = { member: ctx.member.id, send: (data: AgentActivitySnapshot) => push({ event: 'agent-activity', data }), end: () => stream.end() }
      readers.add(reader); reader.send(snapshot(reader.member))
      return () => { readers.delete(reader) }
    }, { signal: request.signal, latestOnly: true })
    return sseResponse(stream, request.signal)
  } }
  return { service, routes: { 'agent-activity/events': route }, close() {
    closed = true
    for (const entry of entries.values()) clearTimeout(entry.timer)
    entries.clear(); for (const reader of readers) reader.end(); readers.clear()
  } }
}
