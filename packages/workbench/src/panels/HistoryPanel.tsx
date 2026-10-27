import type { HistoryRevision } from '@lincyaw/kernel'
import { PmBadge, PmButton, PmEmpty, PmIcon, PmIconButton, PmNotice } from '../components.tsx'
import type { IconName } from '@lincyaw/design'
import { useMessages, useWorkbench, useWorkbenchState } from '../context.tsx'
import { timeAgo } from '../messages.ts'
import { isAgentChanging } from '../workbench.ts'

/** The document's versions, newest first: who changed what and when; each change can be undone or redone on its own. */
export function HistoryPanel({ onClose }: { onClose(): void }) {
  const t = useMessages()
  const workbench = useWorkbench()
  const history = useWorkbenchState(state => state.history)
  const outside = useWorkbenchState(state => state.outside)
  const busy = useWorkbenchState(state => state.isHistoryBusy || state.isHistoryPreparing || isAgentChanging(state))
  const locale = useWorkbenchState(state => state.locale)
  const revisions = history?.revisions ?? []
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
                const undone = revision.undone === true
                const [summary = ''] = revision.message.split('\n')
                return (
                  <li key={revision.id} className="pmw-version" data-origin={revision.origin.kind} data-undone={undone || undefined}>
                    <span className="pmw-version__icon" aria-hidden="true"><PmIcon name={icon(revision)} /></span>
                    <div className="pmw-version__body">
                      <p className="pmw-version__summary">{summary}</p>
                      <p className="pmw-version__meta">
                        <span>{who(revision)}</span>
                        <span>·</span>
                        <time dateTime={revision.date} title={new Date(revision.date).toLocaleString(locale)}>{timeAgo(revision.date, locale)}</time>
                        {undone && <PmBadge>{t.undone}</PmBadge>}
                      </p>
                    </div>
                    {!revision.operation && revision.revertible !== false && (
                      <PmButton small className="pmw-version__action" disabled={busy || history?.loading} onClick={() => void workbench.revertRevision(revision.revertTarget ?? revision.id)}>
                        {undone ? t.redoChange : t.undoChange}
                      </PmButton>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
      {(history?.nextOffset !== undefined || history?.previousOffset !== undefined) && <div className="pmw-history-pages">
        <PmButton small disabled={busy || history.previousOffset === undefined} loading={Boolean(history.loading)} onClick={() => { if (history.previousOffset !== undefined) void workbench.readHistoryPage(history.previousOffset) }}>{t.historyNewer}</PmButton>
        <PmButton small disabled={busy || history.nextOffset === undefined} loading={Boolean(history.loading)} onClick={() => { if (history.nextOffset !== undefined) void workbench.readHistoryPage(history.nextOffset) }}>{t.historyOlder}</PmButton>
      </div>}
    </section>
  )
}
