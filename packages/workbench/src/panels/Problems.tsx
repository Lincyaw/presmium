import { useState } from 'react'
import { PmButton, PmIcon, PmNotice } from '../components.tsx'
import { useMessages, useWorkbench, useWorkbenchStore } from '../react.tsx'

export function ProblemsPanel({ compact = false }: { compact?: boolean }) {
  const t = useMessages()
  const workbench = useWorkbenchStore()
  const snapshot = useWorkbench(state => state.diagnostics)
  const unavailable = useWorkbench(state => state.diagnosticsUnavailable)
  const canRepair = useWorkbench(state => state.canRepairDiagnostics)
  const repairing = useWorkbench(state => state.diagnosticsRepairing)
  const repairFailure = useWorkbench(state => state.diagnosticsRepairFailure)
  const findings = snapshot?.diagnostics ?? []
  const count = findings.length
  const [expanded, setExpanded] = useState(false)
  const collapsed = compact && !expanded
  const error = findings.find(finding => finding.severity === 'error')
  const summary = error?.message ?? findings[0]?.message
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
        {findings.map(finding => (
          <li key={finding.id}>
            <button type="button" className="pmw-problem" data-severity={finding.severity} disabled={!finding.source?.file} onClick={() => void workbench.revealProblem(finding)}>
              <PmIcon name={finding.severity === 'error' ? 'error' : finding.severity === 'warning' ? 'warning' : 'info'} size={15} />
              <span className="pmw-problem__severity">{t.severity[finding.severity] ?? finding.severity}</span>
              <span className="pmw-problem__where">{finding.source ? `${finding.source.file}${finding.source.line ? `:${finding.source.line}` : ''}` : finding.renderer ? t.views[finding.renderer] : ''}</span>
              <span className="pmw-problem__message">{finding.message}{finding.hint ? ` ${finding.hint}` : ''}</span>
            </button>
          </li>
        ))}
      </ul>
      )}
    </section>
  )
}
