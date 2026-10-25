import { PmIcon, PmIconButton, useMessages, useStore } from '@lincyaw/host'
import type { IRBlock, IRSection } from '@lincyaw/kernel'
import { useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import { CodeEditor } from '../../code/code-editor.ts'
import { useViewer } from '../../viewer-state.ts'
import { SOURCE_MESSAGES } from './messages.ts'
import { sourceDirty, sourceSession } from './session.ts'
import type { SourcePart } from './session.ts'
import './style.css'

/** A generated block edits its own source; its preview and narration keep the same IR identity. */
export function SourceBlock({ section, block, actions, children }: { section: IRSection; block: IRBlock; actions?: ReactNode; children?: ReactNode }) {
  const viewer = useViewer()
  const session = useMemo(() => sourceSession(viewer), [viewer])
  const t = useMessages(SOURCE_MESSAGES)
  const defined = block.node.type === 'component' && Boolean(block.node.definition)
  const defaultPart = defined ? 'definition' : 'block'
  const viewStore = useMemo(() => session.view(section.id, block.id, defaultPart), [session, section.id, block.id, defaultPart])
  const view = useStore(viewStore)
  const definitionStore = useMemo(() => session.state(section.id, block.id, 'definition'), [session, section.id, block.id])
  const blockStore = useMemo(() => session.state(section.id, block.id, 'block'), [session, section.id, block.id])
  const definition = useStore(definitionStore)
  const configuration = useStore(blockStore)
  const state = view.part === 'definition' ? definition : configuration
  const dirty = sourceDirty(state)
  const busy = state.status === 'saving' || state.status === 'loading'
  const syntax = /^source-syntax:(\d+):(\d+)$/.exec(state.error ?? '')
  const failure = syntax ? t.syntax(Number(syntax[1]), Number(syntax[2])) : state.error === 'source-conflict' ? t.conflict : state.error === 'source-timeout' ? t.timeout : state.error === 'source-unavailable' ? t.unavailable : state.error === 'source-storage' ? t.storage : state.error
  const run = (work: Promise<unknown>) => { void work.catch(() => {}) }
  const source = (part: SourcePart = view.part) => run(session.showSource(section.id, block.id, part))
  const save = (preview = false) => run(preview ? session.showPreview(section.id, block.id, view.part) : session.save(section.id, block.id, view.part))
  useEffect(() => {
    if (view.mode === 'source') run(session.read(section.id, block.id, view.part))
    session.mounted(section.id, block.id)
  }, [session, section.id, block.id, view.mode, view.part])
  return (
    <div
      className="pm-source-block pm-ui"
      data-source-mode={view.mode}
      data-source-part={view.part}
      contentEditable={false}
      onFocusCapture={() => session.focus(section.id, block.id)}
      onKeyDown={(event) => {
        if (view.mode !== 'source' || !(event.metaKey || event.ctrlKey)) return
        if (event.key.toLowerCase() !== 's' && event.key !== 'Enter') return
        const handled = event.defaultPrevented
        event.preventDefault()
        event.stopPropagation()
        if (!handled) save(event.key === 'Enter')
      }}
    >
      <div className="pm-source-block__toolbar" data-preview-ui="">
        <div className="pm-source-block__views" role="group" aria-label={t.views}>
          <PmIconButton small icon="code" label={t.source} aria-pressed={view.mode === 'source'} disabled={busy} onClick={() => source()} />
          <PmIconButton small icon="eye" label={t.preview} aria-pressed={view.mode === 'preview'} disabled={state.status === 'saving'} onClick={() => { if (view.mode !== 'preview') run(session.showPreview(section.id, block.id, view.part)) }} />
        </div>
        {view.mode === 'source' && defined && (
          <div className="pm-source-block__parts" role="group" aria-label={t.parts}>
            <button type="button" className="pm-ui-button pm-ui-button--ghost pm-ui-button--small" aria-pressed={view.part === 'definition'} data-dirty={sourceDirty(definition) || undefined} disabled={busy} onClick={() => source('definition')}>{t.code}</button>
            <button type="button" className="pm-ui-button pm-ui-button--ghost pm-ui-button--small" aria-pressed={view.part === 'block'} data-dirty={sourceDirty(configuration) || undefined} disabled={busy} onClick={() => source('block')}>{t.configuration}</button>
          </div>
        )}
        <span className="pm-source-block__spacer" />
        {view.mode === 'source' && state.source && (
          <span className="pm-source-block__language">{state.source.language}</span>
        )}
        {view.mode === 'source' && (state.source?.shared ?? 0) > 1 && (
          <span className="pm-source-block__shared" role="img" title={t.shared(state.source!.shared)} aria-label={t.shared(state.source!.shared)}><PmIcon name="copy" /><span>{state.source!.shared}</span></span>
        )}
        {view.mode === 'source' && (
          <>
            <span className="pm-source-block__status" role="status">{state.status === 'loading' ? t.loading : state.status === 'saving' ? t.saving : state.status === 'failed' ? t.failed : dirty ? t.dirty : t.saved}</span>
            <PmIconButton small icon="save" label={t.save} disabled={busy || !dirty} onClick={() => save()} />
          </>
        )}
        {actions}
      </div>
      {view.mode === 'source' ? (
        <div className="pm-source-block__source" data-preview-ui="">
          {failure && <div className="pm-ui-notice pm-ui-notice--danger" role="alert">{failure}<PmIconButton small icon="undo" label={t.reload} disabled={busy} onClick={() => run(session.reload(section.id, block.id, view.part))} /></div>}
          {state.source && <CodeEditor key={`${section.id}:${block.id}:${view.part}`} lang={state.source.language} label={t.editor} value={state.draft ?? state.source.content} onChange={(content) => session.edit(section.id, block.id, view.part, content)} onRun={() => save(true)} onSave={() => save()} onError={(error) => session.fail(section.id, block.id, view.part, error)} shouldFocus={() => session.isActive(section.id, block.id)} />}
        </div>
      ) : children}
    </div>
  )
}
