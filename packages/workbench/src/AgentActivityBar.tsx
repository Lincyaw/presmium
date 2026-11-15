import { PmAgentActivity, PmIconButton, PmTooltip } from './components.tsx'
import { useWorkbench, useWorkbenchState } from './context.tsx'
import { latestAgentActivity } from './agent-activity.ts'
import { AGENT_ACTIVITY_MESSAGES } from './agent-activity-messages.ts'

/** A compact presence row, not a second activity log or an editor lock. */
export function AgentActivityBar() {
  const workbench = useWorkbench(), state = useWorkbenchState(value => value)
  const activity = latestAgentActivity(state.agentActivities), t = AGENT_ACTIVITY_MESSAGES[state.locale]
  if (!activity) return null
  const title = state.documents?.documents.find(doc => doc.dir === activity.document)?.title
  const content = state.document === activity.document ? state.authoring?.content : undefined, target = activity.targets[0]
  const section = target?.section ?? (target?.step ? content?.steps[target.step]?.sectionId : undefined)
  const page = section ? content?.sections[section]?.title : undefined
  const location = [title, page].filter(Boolean).join(' · ')
  const label = `${activity.state === 'running' ? t[activity.operation] : t[activity.state]}${location ? ` · ${location}` : ''}`
  const count = state.agentActivities?.filter(value => value.state === 'running').length ?? 0
  const detail = `${label}${count > 1 ? ` · ${t.concurrent(count)}` : ''}${!state.agentFollowing ? ` · ${t.paused}` : ''}`
  const short = activity.state === 'running' ? t.compact[activity.operation] : t.compact[activity.state]
  return <span className="pmw-agent-activity" data-agent-activity-controls="">
    <PmTooltip label={detail}><span className="pmw-agent-activity__label"><PmAgentActivity compact state={activity.state} label={short} detail={detail} /></span></PmTooltip>
    <PmIconButton small icon={state.agentFollowing ? 'pause' : 'fit'} label={state.agentFollowing ? t.pauseLabel : t.followLabel}
      aria-pressed={Boolean(state.agentFollowing)} onClick={() => workbench.setAgentFollowing(!state.agentFollowing)} />
  </span>
}
