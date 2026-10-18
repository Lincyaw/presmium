import { PmIcon } from '../components.tsx'
import { useMessages, useWorkbench, useWorkbenchStore } from '../react.tsx'

export function ProblemsPanel() {
  const t = useMessages()
  const workbench = useWorkbenchStore()
  const ir = useWorkbench(state => state.ir)
  const issues = useWorkbench(state => state.issues)
  const findings = ir?.diagnostics ?? []
  const count = findings.length + issues.length
  return (
    <section className="pmw-problems" aria-label={t.problems}>
      <h2 className="pmw-problems__head">
        {t.problems}
        <span className="pm-ui-badge" data-count={count}>{count}</span>
      </h2>
      {ir && count === 0 && <p className="pmw-muted pmw-problems__none">{t.noProblems}</p>}
      <ul className="pmw-problems__list">
        {findings.map((finding, i) => (
          <li key={`f${i}`}>
            <button type="button" className="pmw-problem" data-severity={finding.severity} disabled={!finding.source?.file} onClick={() => void workbench.revealProblem(finding)}>
              <PmIcon name={finding.severity === 'error' ? 'error' : finding.severity === 'warning' ? 'warning' : 'info'} size={15} />
              <span className="pmw-problem__severity">{t.severity[finding.severity] ?? finding.severity}</span>
              <span className="pmw-problem__where">{finding.source ? `${finding.source.file}${finding.source.line ? `:${finding.source.line}` : ''}` : ''}</span>
              <span className="pmw-problem__message">{finding.message}{finding.hint ? ` ${finding.hint}` : ''}</span>
            </button>
          </li>
        ))}
        {issues.map((issue, i) => (
          <li key={`p${i}`}>
            <div className="pmw-problem" data-severity={issue.level}>
              <PmIcon name={issue.level === 'error' ? 'error' : 'warning'} size={15} />
              <span className="pmw-problem__severity">{t.severity[issue.level]}</span>
              <span className="pmw-problem__where">{t.page}{issue.plugin ? ` · ${issue.plugin}` : ''}</span>
              <span className="pmw-problem__message">{issue.message}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
