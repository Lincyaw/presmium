import type { AgentActivity } from '@lincyaw/kernel'
import { PmAgentActivity, PmIconButton, PmTooltip } from './components.tsx'
import { useWorkbench, useWorkbenchState } from './context.tsx'
import { latestAgentActivity } from './agent-activity.ts'
import { AGENT_ACTIVITY_MESSAGES } from './agent-activity-messages.ts'

/**
 * A compact presence row, not a second activity log or an editor lock. With a host that runs the AI Assistant's turns,
 * the turn says whether the AI is working: a running tool call names what it does, otherwise it is thinking; after the
 * turn, its outcome. Tool calls outside any turn (another agent's, over MCP) still show while they run.
 */
export function AgentActivityBar() {
  const workbench = useWorkbench(), state = useWorkbenchState(value => value)
  const t = AGENT_ACTIVITY_MESSAGES[state.locale], turn = state.agentTurn
  const latest = latestAgentActivity(state.agentActivities), running = latest?.state === 'running' ? latest : undefined
  const shown: { state: AgentActivity['state'], key: AgentActivity['operation'] | 'thinking' | Exclude<AgentActivity['state'], 'running'>, activity?: AgentActivity } | undefined
    = turn === undefined ? latest && { state: latest.state, key: latest.state === 'running' ? latest.operation : latest.state, activity: latest }
      : running ? { state: 'running', key: running.operation, activity: running }
        : turn === 'running' ? { state: 'running', key: 'thinking' }
          : turn === 'idle' ? undefined : { state: turn, key: turn, activity: latest }
  if (!shown) return null
  const activity = shown.activity
  const title = activity && state.documents?.documents.find(doc => doc.dir === activity.document)?.title
  const content = activity && state.document === activity.document ? state.authoring?.content : undefined, target = activity?.targets[0]
  const section = target?.section ?? (target?.step ? content?.steps[target.step]?.sectionId : undefined)
  const page = section ? content?.sections[section]?.title : undefined
  const location = [title, page].filter(Boolean).join(' · ')
  const label = `${t[shown.key]}${location ? ` · ${location}` : ''}`
  const count = state.agentActivities?.filter(value => value.state === 'running').length ?? 0
  const detail = `${label}${count > 1 ? ` · ${t.concurrent(count)}` : ''}${!state.agentFollowing ? ` · ${t.paused}` : ''}`
  const short = t.compact[shown.key]
  return <span className="pmw-agent-activity" data-agent-activity-controls="">
    <PmTooltip label={detail}><span className="pmw-agent-activity__label"><PmAgentActivity compact state={shown.state} label={short} detail={detail} /></span></PmTooltip>
    <PmIconButton small icon={state.agentFollowing ? 'pause' : 'fit'} label={state.agentFollowing ? t.pauseLabel : t.followLabel}
      aria-pressed={Boolean(state.agentFollowing)} onClick={() => workbench.setAgentFollowing(!state.agentFollowing)} />
  </span>
}
