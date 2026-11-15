import type { AgentActivity } from '@lincyaw/kernel'
import type { Workbench } from './workbench.ts'

export const latestAgentActivity = (activities: readonly AgentActivity[] = []) => [...activities].sort((a, b) => Number(b.state === 'running') - Number(a.state === 'running') || b.startedAt - a.startedAt)[0]

/** One root-lifetime subscription; reconnect resets observations, and human gestures always win navigation. */
export function connectAgentActivity(workbench: Workbench): () => void {
  const subscribe = workbench.client.subscribeAgentActivity
  if (!subscribe) return () => {}
  let closed = false, followed: string | undefined, following: AbortController | undefined
  let navigating: { document?: string, controller: AbortController } | undefined
  workbench.setAgentFollowing(true)
  const follow = () => {
    if (closed || !workbench.state.agentFollowing) { following?.abort(); followed = undefined; return }
    const activity = latestAgentActivity(workbench.state.agentActivities)
    if (!activity || activity.id === followed) return
    if (navigating && navigating.document === activity.document && !navigating.controller.signal.aborted) return
    followed = activity.id; following?.abort(); following = new AbortController()
    const task = { document: activity.document, controller: following }; navigating = task
    void workbench.followAgentActivity(activity, following.signal).catch(() => {}).finally(() => {
      if (navigating === task) { navigating = undefined; follow() }
    })
  }
  const stop = subscribe(snapshot => { if (!closed) { workbench.setAgentActivities(snapshot.activities); follow() } }, () => {
    following?.abort(); followed = undefined; workbench.setAgentActivities([])
  })
  const stopState = workbench.subscribe(follow)
  const interrupt = (event: Event) => {
    if (!workbench.state.agentActivities?.length || event.target instanceof Element && event.target.closest('[data-agent-activity-controls]')) return
    if (event instanceof KeyboardEvent && !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', 'Escape'].includes(event.key)) return
    following?.abort(); workbench.setAgentFollowing(false)
  }
  document.addEventListener('pointerdown', interrupt, true); document.addEventListener('input', interrupt, true); document.addEventListener('wheel', interrupt, true); document.addEventListener('keydown', interrupt, true)
  return () => {
    closed = true; following?.abort(); stop(); stopState(); workbench.setAgentActivities([])
    document.removeEventListener('pointerdown', interrupt, true); document.removeEventListener('input', interrupt, true); document.removeEventListener('wheel', interrupt, true); document.removeEventListener('keydown', interrupt, true)
  }
}
