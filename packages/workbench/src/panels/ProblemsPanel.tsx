import { useState } from 'react'
import { PmButton, PmIcon, PmNotice } from '../components.tsx'
import { useMessages, useWorkbench, useWorkbenchState } from '../context.tsx'

export function ProblemsPanel({ compact = false }: { compact?: boolean }) {
  const t = useMessages()
  const workbench = useWorkbench()
  const snapshot = useWorkbenchState(state => state.diagnostics)
  const unavailable = useWorkbenchState(state => state.isDiagnosticsUnavailable)
  const canRepair = useWorkbenchState(state => state.canRepairDiagnostics)
  const repairing = useWorkbenchState(state => state.isRepairingDiagnostics)
  const repairFailure = useWorkbenchState(state => state.diagnosticsRepairFailure)
  const diagnostics = snapshot?.diagnostics ?? []
  const count = diagnostics.length
  const [expanded, setExpanded] = useState(false)
  const collapsed = compact && !expanded
  const error = diagnostics.find(diagnostic => diagnostic.severity === 'error')
  const summary = error?.message ?? diagnostics[0]?.message
  if (compact && snapshot && count === 0 && !unavailable && !repairFailure) return null
  return (
    <section className="pmw-problems" aria-label={t.problems}>
      <h2 className="pmw-problems__head">
        {t.problems}
        {snapshot && (!unavailable || count > 0) && <span className="pm-ui-badge" data-count={count}>{count}</span>}
        <span className="pmw-spacer" />
        {count > 0 && canRepair && <PmButton small disabled={unavailable || repairing} onClick={() => void workbench.requestRepairDiagnostics()}>{repairing ? t.repairingDiagnostics : t.repairDiagnostics}</PmButton>}
        {compact && count > 0 && <PmButton small aria-expanded={!collapsed} onClick={() => setExpanded(value => !value)}>{collapsed ? t.showProblems : t.hideProblems}</PmButton>}
      </h2>
      {unavailable && <PmNotice tone="warn"><span>{t.diagnosticsUnavailable}</span><PmButton small onClick={() => workbench.retryDiagnostics()}>{t.retryDiagnostics}</PmButton></PmNotice>}
      {repairFailure && <PmNotice tone="danger">{t.diagnosticsRepairFailed(repairFailure)}</PmNotice>}
      {!snapshot && !unavailable && <p className="pmw-muted pmw-problems__none">{t.diagnosticsLoading}</p>}
      {snapshot && count === 0 && !unavailable && <p className="pmw-muted pmw-problems__none">{t.noProblems}</p>}
      {collapsed ? summary && <p className="pmw-problems__summary" role={error ? 'alert' : 'status'} data-severity={error ? 'error' : 'warning'}>{summary}</p> : (
      <ul className="pmw-problems__list">
        {diagnostics.map(diagnostic => (
          <li key={diagnostic.id}>
            <button type="button" className="pmw-problem" data-severity={diagnostic.severity} disabled={!diagnostic.source?.file} onClick={() => void workbench.revealProblem(diagnostic)}>
              <PmIcon name={diagnostic.severity === 'error' ? 'error' : diagnostic.severity === 'warning' ? 'warning' : 'info'} size={15} />
              <span className="pmw-problem__severity">{t.severity[diagnostic.severity] ?? diagnostic.severity}</span>
              <span className="pmw-problem__where">{diagnostic.source ? `${diagnostic.source.file}${diagnostic.source.line ? `:${diagnostic.source.line}` : ''}` : diagnostic.renderer ? t.renderers[diagnostic.renderer] : ''}</span>
              <span className="pmw-problem__message">{diagnostic.message}{diagnostic.hint ? ` ${diagnostic.hint}` : ''}</span>
            </button>
          </li>
        ))}
      </ul>
      )}
    </section>
  )
}
