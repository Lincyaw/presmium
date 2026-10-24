import { useState } from 'react'
import type { CompileJob, OutputTarget } from '@lincyaw/kernel'
import type { IconName } from '@lincyaw/design'
import { PmBadge, PmButton, PmDialog, PmEmpty, PmIcon, PmIconButton, PmNotice } from '../components.tsx'
import { useMessages, useWorkbench, useWorkbenchState } from '../context.tsx'
import { timeAgo } from '../messages.ts'

// The media types a browser shows by itself; a file of another type is downloaded.
const SHOWN = new Set(['text/html', 'application/pdf'])
const isVideo = (type: string | undefined) => type?.startsWith('video/') === true

const TONES: Record<CompileJob['state'], 'neutral' | 'accent' | 'ok' | 'warn' | 'danger'> = { queued: 'neutral', running: 'accent', done: 'ok', failed: 'danger', cancelled: 'warn' }

function iconOf(target: string): IconName {
  if (target === 'web') return 'website'
  if (target === 'slides' || target === 'pdf' || target === 'pptx') return 'slides'
  if (target === 'notebook') return 'notebook'
  if (target === 'video' || target === 'lecture') return 'video'
  return 'export'
}

/**
 * Making the document into files, as Word's Export: what it can be made into, each a button, and what was made, by the
 * author or the AI, newest first, with its progress, its log, and the file to open, play or download.
 */
export function ExportPanel({ onClose }: { onClose(): void }) {
  const t = useMessages()
  const workbench = useWorkbench()
  const answer = useWorkbenchState(state => state.jobs)
  const failure = useWorkbenchState(state => state.jobsFailure)
  const revision = useWorkbenchState(state => state.ir?.revision)
  const locale = useWorkbenchState(state => state.locale)
  const [playing, setPlaying] = useState<CompileJob>()
  const labelOf = (target: Pick<OutputTarget, 'id' | 'label'>) => (target.label[locale] !== target.id ? target.label[locale] : undefined) ?? t.outputLabels[target.id] ?? target.id
  const targets = answer?.targets ?? []
  const jobs = answer?.jobs ?? []
  const label = (id: string) => labelOf(targets.find(target => target.id === id) ?? { id, label: {} })
  const busy = (id: string) => jobs.some(job => job.target === id && (job.state === 'queued' || job.state === 'running'))
  return (
    <section className="pmw-pane" aria-labelledby="pmw-export-title">
      <header className="pmw-pane__header">
        <h2 id="pmw-export-title" className="pmw-pane__title">{t.exportPane}</h2>
        <PmIconButton small icon="close" label={t.close} onClick={onClose} />
      </header>
      <p className="pmw-export__hint">{t.exportHint}</p>
      {failure && <PmNotice tone="danger">{t.outputFailed(failure)}</PmNotice>}
      <h3 id="pmw-export-make" className="pmw-export__subtitle">{t.makeLabel}</h3>
      <ul className="pmw-export__targets" aria-labelledby="pmw-export-make">
        {targets.map(target => (
          <li key={target.id}>
            <PmButton small icon={iconOf(target.id)} aria-label={t.makeOutput(labelOf(target))} disabled={busy(target.id)} onClick={() => void workbench.startJob(target.id)}>{labelOf(target)}</PmButton>
          </li>
        ))}
      </ul>
      <h3 className="pmw-export__subtitle">{t.outputsList}</h3>
      {jobs.length === 0
        ? <PmEmpty icon="export">{t.noOutputs}</PmEmpty>
        : (
            <ol className="pmw-jobs">
              {jobs.map(job => <JobItem key={job.id} job={job} label={label(job.target)} current={job.revision === revision} onPlay={() => setPlaying(job)} />)}
            </ol>
          )}
      <PmDialog open={playing !== undefined} label={playing ? label(playing.target) : ''} closeLabel={t.close} onClose={() => setPlaying(undefined)}>
        {playing?.main && (
          <video className="pmw-export__video" controls autoPlay src={`${playing.url}${playing.main}`} crossOrigin="anonymous">
            {Object.entries(playing.captions ?? {}).map(([lang, path]) => <track key={lang} kind="subtitles" srcLang={lang} label={lang} src={`${playing.url}${path}`} default={lang === locale} />)}
          </video>
        )}
      </PmDialog>
    </section>
  )
}

function JobItem({ job, label, current, onPlay }: { job: CompileJob, label: string, current: boolean, onPlay(): void }) {
  const t = useMessages()
  const workbench = useWorkbench()
  const locale = useWorkbenchState(state => state.locale)
  const main = job.main && `${job.url}${job.main}`
  const type = job.files.find(file => file.path === job.main)?.type
  const progress = job.progress
  return (
    <li className="pmw-job" data-state={job.state}>
      <span className="pmw-job__icon" aria-hidden="true"><PmIcon name={iconOf(job.target)} size={16} /></span>
      <div className="pmw-job__body">
        <p className="pmw-job__title">{label}</p>
        <p className="pmw-job__meta">
          <PmBadge tone={TONES[job.state]}>{t.jobStates[job.state]}</PmBadge>
          <time dateTime={job.createdAt} title={new Date(job.createdAt).toLocaleString(locale)}>{timeAgo(job.createdAt, locale)}</time>
          {job.state === 'done' && <span>· {current ? t.currentContent : t.olderContent}</span>}
          {job.state === 'done' && job.files.length > 1 && <span>· {t.outputFiles(job.files.length)}</span>}
        </p>
        {job.state === 'running' && progress && (
          <div className="pmw-job__progress">
            <progress max={progress.total ?? 1} value={progress.total ? progress.done ?? 0 : undefined} aria-label={label} />
            <span>{t.jobProgress(t.jobPhases[progress.phase] ?? t.outputLabels[progress.phase] ?? progress.phase, progress.done, progress.total)}</span>
          </div>
        )}
        {job.error && <p className="pmw-job__error">{job.error.split('\n')[0]}</p>}
        {job.log.length > 0 && (
          <details className="pmw-job__log">
            <summary>{t.outputLog}</summary>
            {/* Scrolled to its end, the latest lines in sight. */}
            <div className="pmw-job__log-lines"><pre>{job.log.join('\n')}</pre></div>
          </details>
        )}
        <div className="pmw-job__actions">
          {job.state === 'done' && main && isVideo(type) && <PmButton small icon="play" onClick={onPlay}>{t.playOutput}</PmButton>}
          {job.state === 'done' && main && type && SHOWN.has(type) && <a className="pm-ui-button pm-ui-button--small" href={main} target="_blank" rel="noopener"><PmIcon name="external" size={14} />{t.openOutput}</a>}
          {job.state === 'done' && main && type !== 'text/html' && <a className="pm-ui-button pm-ui-button--small" href={`${main}?download`}><PmIcon name="download" size={14} />{t.downloadOutput}</a>}
          {(job.state === 'queued' || job.state === 'running') && <PmButton small onClick={() => void workbench.cancelJob(job.id)}>{t.cancelOutput}</PmButton>}
        </div>
      </div>
    </li>
  )
}
