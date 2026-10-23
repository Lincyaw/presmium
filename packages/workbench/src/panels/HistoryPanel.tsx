import type { HistoryRevision } from '@lincyaw/kernel'
import { PmBadge, PmButton, PmEmpty, PmIcon, PmIconButton, PmNotice } from '../components.tsx'
import type { IconName } from '@lincyaw/design'
import { useMessages, useWorkbench, useWorkbenchState } from '../context.tsx'
import { timeAgo } from '../messages.ts'
import { isAgentChanging } from '../workbench.ts'

/** The revisions that undo a change and redo it again, in order; an odd number of them leaves the change undone. */
function undoChain(revision: HistoryRevision, byId: Map<string, HistoryRevision>): string[] {
  const chain: string[] = []
  for (let id = revision.revertedBy; id && !chain.includes(id); id = byId.get(id)?.revertedBy) chain.push(id)
  return chain
}

/** The document's versions, newest first: who changed what and when; each change can be undone or redone on its own. */
export function HistoryPanel({ onClose }: { onClose(): void }) {
  const t = useMessages()
  const workbench = useWorkbench()
  const history = useWorkbenchState(state => state.history)
  const outside = useWorkbenchState(state => state.outside)
  const busy = useWorkbenchState(state => state.isHistoryBusy || isAgentChanging(state))
  const locale = useWorkbenchState(state => state.locale)
  const revisions = history?.revisions ?? []
  const byId = new Map(revisions.map(revision => [revision.id, revision]))
  // Undoing and redoing are not versions of their own: they mark the change they act on.
  const changes = revisions.filter(revision => !revision.reverts)
  const who = (revision: HistoryRevision) => (revision.origin.kind === 'agent' ? t.byAi : revision.origin.kind === 'document' ? t.byDocument : t.byYou)
  const icon = (revision: HistoryRevision): IconName => (revision.origin.kind === 'agent' ? 'sparkle' : revision.origin.kind === 'document' ? 'document' : 'edit')
  return (
    <section className="pmw-pane" aria-labelledby="pmw-history-title">
      <header className="pmw-pane__header">
        <h2 id="pmw-history-title" className="pmw-pane__title">{t.versionHistory}</h2>
        <PmIconButton small icon="close" label={t.close} onClick={onClose} />
      </header>
      {outside && outside.length > 0 && (
        <PmNotice tone="warn">
          <span>{t.outside(outside.length)}</span>
          <PmButton small disabled={busy} onClick={() => void workbench.recordOutsideChanges()}>{t.recordOutside}</PmButton>
        </PmNotice>
      )}
      {changes.length === 0
        ? <PmEmpty icon="versions">{t.noHistory}</PmEmpty>
        : (
            <ol className="pmw-versions">
              {changes.map((revision) => {
                const chain = undoChain(revision, byId)
                const undone = chain.length % 2 === 1
                const [summary = ''] = revision.message.split('\n')
                return (
                  <li key={revision.id} className="pmw-version" data-origin={revision.origin.kind} data-undone={undone || undefined}>
                    <span className="pmw-version__icon" aria-hidden="true"><PmIcon name={icon(revision)} size={16} /></span>
                    <div className="pmw-version__body">
                      <p className="pmw-version__summary">{summary}</p>
                      <p className="pmw-version__meta">
                        <span>{who(revision)}</span>
                        <span>·</span>
                        <time dateTime={revision.date} title={new Date(revision.date).toLocaleString(locale)}>{timeAgo(revision.date, locale)}</time>
                        {undone && <PmBadge>{t.undone}</PmBadge>}
                      </p>
                    </div>
                    {!revision.operation && (
                      <PmButton small className="pmw-version__action" disabled={busy} onClick={() => void workbench.revertRevision(undone ? chain.at(-1)! : revision.id)}>
                        {undone ? t.redoChange : t.undoChange}
                      </PmButton>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
    </section>
  )
}
