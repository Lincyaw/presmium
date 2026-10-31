import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { CompileJob, OutputTarget } from '@lincyaw/kernel'
import type { IconName } from '@lincyaw/design'
import { PmBadge, PmButton, PmDialog, PmEmpty, PmIcon, PmIconButton, PmMascot, PmNotice } from '../components.tsx'
import { useMessages, useWorkbench, useWorkbenchState } from '../context.tsx'
import { failureReason, timeAgo } from '../messages.ts'

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
export function ExportPanel({ documentOnly = false, embedded = false, onClose }: { documentOnly?: boolean, embedded?: boolean, onClose(): void }) {
  const t = useMessages()
  const workbench = useWorkbench()
  const document = useWorkbenchState(state => state.document)
  useEffect(() => workbench.observeJobs(), [workbench, document])
  const answer = useWorkbenchState(state => state.jobs)
  const failure = useWorkbenchState(state => state.jobsFailure)
  const source = useWorkbenchState(state => state.authoring)
  const preparing = useWorkbenchState(state => state.jobPreparing)
  const locale = useWorkbenchState(state => state.locale)
  const [playing, setPlaying] = useState<CompileJob>()
  const labelOf = (target: Pick<OutputTarget, 'id' | 'label'>) => (target.label[locale] !== target.id ? target.label[locale] : undefined) ?? t.outputLabels[target.id] ?? target.id
  const included = (id: string) => !documentOnly || id !== 'video' && id !== 'lecture'
  const targets = (answer?.targets ?? []).filter(target => included(target.id))
  const jobs = (answer?.jobs ?? []).filter(job => included(job.target))
  const label = (id: string) => labelOf(targets.find(target => target.id === id) ?? { id, label: {} })
  const busy = (id: string) => jobs.some(job => job.target === id && (job.state === 'queued' || job.state === 'running'))
  return (
    <section className="pmw-pane" aria-labelledby={embedded ? undefined : 'pmw-export-title'} aria-label={embedded ? t.exportPane : undefined}>
      {!embedded && <header className="pmw-pane__header">
        <h2 id="pmw-export-title" className="pmw-pane__title">{documentOnly ? t.documentExport : t.exportPane}</h2>
        <PmIconButton small icon="close" label={t.close} onClick={onClose} />
      </header>}
      {failure && <PmNotice tone="danger">{t.outputFailed(t.jobFailureReasons[failure] ?? failureReason(t, failure))}</PmNotice>}
      {preparing && <PmNotice>{preparing.canCancel ? t.outputConfirmingSave : t.outputStarting} {preparing.canCancel && <PmButton small onClick={() => workbench.cancelJobPreparation()}>{t.cancelOutput}</PmButton>}</PmNotice>}
      {!embedded && <h3 id="pmw-export-make" className="pmw-export__subtitle">{t.makeLabel}</h3>}
      <ul className="pmw-export__targets" aria-labelledby={embedded ? undefined : 'pmw-export-make'} aria-label={embedded ? t.makeLabel : undefined}>
        {targets.map(target => (
          <li key={target.id}>
            <PmButton small loading={preparing?.target === target.id} icon={iconOf(target.id)} aria-label={t.makeOutput(labelOf(target))} disabled={busy(target.id) || preparing !== undefined} onClick={() => void workbench.startJob(target.id)}>{labelOf(target)}</PmButton>
          </li>
        ))}
      </ul>
      <h3 className="pmw-export__subtitle">{t.outputsList}</h3>
      {jobs.length === 0
        ? <PmEmpty icon="export">{t.noOutputs}</PmEmpty>
        : (
            <ol className="pmw-jobs">
              {jobs.map(job => <JobItem key={job.id} job={job} label={label(job.target)} current={Boolean(!source?.error && !source?.loading && !source?.dirty && !source?.saving && !source?.composing && !source?.restored && job.source && job.source.version === source?.version && job.source.fingerprint === source?.fingerprint)} onPlay={() => setPlaying(job)} />)}
            </ol>
          )}
      <VideoDialog job={playing} label={playing ? label(playing.target) : ''} onClose={() => setPlaying(undefined)} />
    </section>
  )
}

/** A video a job made, played in a dialog with its captions (those in the workbench's language shown). */
export function VideoDialog({ job, label, onClose }: { job: CompileJob | undefined, label: string, onClose(): void }) {
  const t = useMessages()
  const locale = useWorkbenchState(state => state.locale)
  return (
    <PmDialog open={job !== undefined} label={label} closeLabel={t.close} onClose={onClose}>
      {job?.main && (
        <video className="pmw-export__video" controls autoPlay src={`${job.url}${job.main}`} crossOrigin="anonymous">
          {Object.entries(job.captions ?? {}).map(([lang, path]) => <track key={lang} kind="subtitles" srcLang={lang} label={lang} src={`${job.url}${path}`} default={lang === locale} />)}
        </video>
      )}
    </PmDialog>
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
          {job.state === 'done' && <span>· {!job.source ? t.outputVersionUnknown : current ? t.currentContent : t.olderContent}</span>}
          {job.state === 'done' && job.files.length > 1 && <span>· {t.outputFiles(job.files.length)}</span>}
        </p>
        {job.state === 'running' && progress && (
          <div className="pmw-job__progress">
            {/* the kitten runs along the bar to how far the job has come; with no total yet it walks at the start */}
            <span className="pmw-job__runner" style={{ '--pmw-job-done': progress.total ? Math.min(1, (progress.done ?? 0) / progress.total) : 0 } as CSSProperties}>
              <PmMascot size="small" action={progress.total ? 'run' : 'walk'} />
            </span>
            <progress max={progress.total ?? 1} value={progress.total ? progress.done ?? 0 : undefined} aria-label={label} />
            <span>{t.jobProgress(t.jobPhases[progress.phase] ?? t.outputLabels[progress.phase] ?? progress.phase, progress.done, progress.total)}</span>
          </div>
        )}
        {job.error && <p className="pmw-job__error">{t.jobFailureReasons[job.error] ?? failureReason(t, job.error)}</p>}
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
          {job.canCancel !== false && (job.state === 'queued' || job.state === 'running') && <PmButton small onClick={() => void workbench.cancelJob(job.id)}>{t.cancelOutput}</PmButton>}
        </div>
      </div>
    </li>
  )
}
