import { useEffect, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { createEditor } from '../editor.ts'
import type { Problem, SourceEditor } from '../editor.ts'
import { PmButton, PmIconButton, PmNotice } from '../components.tsx'
import { useMessages, useWorkbench, useWorkbenchState } from '../context.tsx'
import { EditorGroup } from '../parts/EditorGroup.tsx'
import type { EditorGroupProps } from '../parts/EditorGroup.tsx'
import type { OpenFile } from '../workbench.ts'

const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1)

export function SourcePanel(props: EditorGroupProps) {
  const t = useMessages()
  const workbench = useWorkbench()
  const openFiles = useWorkbenchState(state => state.openFiles)
  const activeFile = useWorkbenchState(state => state.activeFile)
  const file = openFiles.find(f => f.path === activeFile)
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return
    event.preventDefault()
    void workbench.save()
  }
  return (
    <section className="pmw-source" aria-label={t.source} onKeyDown={onKeyDown}>
      <EditorGroup {...props} kind="source" actions={<SourceActions />}>
      {file?.notice && <FileNoticeBox file={file} />}
      <SourceEditorPane />
      {!file && <p className="pmw-source__empty pmw-muted">{t.noFile}</p>}
      </EditorGroup>
    </section>
  )
}

export function SourceActions() {
  const t = useMessages()
  const workbench = useWorkbench()
  const file = useWorkbenchState(state => state.openFiles.find(file => file.path === state.activeFile))
  return file && <PmIconButton small icon="save" label={t.save} disabled={!file.isDirty} onClick={() => void workbench.save(file.path)} />
}

function FileNoticeBox({ file }: { file: OpenFile }) {
  const t = useMessages()
  const workbench = useWorkbench()
  const notice = file.notice!
  switch (notice.kind) {
    case 'changed':
      return (
        <PmNotice tone="warn">
          <span>{t.changedOnDisk(nameOf(file.path))}</span>
          <span className="pmw-notice__actions">
            <PmButton small onClick={() => workbench.merge(file.path, { mine: t.mergeMine, theirs: t.mergeTheirs })}>{t.merge}</PmButton>
            <PmButton small onClick={() => workbench.reload(file.path)}>{t.reload}</PmButton>
          </span>
        </PmNotice>
      )
    case 'merged': return <PmNotice tone="accent">{t.merged(notice.conflicts)}</PmNotice>
    case 'locked': return <PmNotice tone="warn">{t.locked}</PmNotice>
    case 'failed': return <PmNotice tone="danger">{t.saveFailed(notice.message)}</PmNotice>
  }
}

function SourceEditorPane() {
  const t = useMessages()
  const workbench = useWorkbench()
  const parent = useRef<HTMLDivElement>(null)
  const editor = useRef<SourceEditor>(undefined)
  const activeFile = useWorkbenchState(state => state.activeFile)
  const reveal = useWorkbenchState(state => state.reveal)
  const ir = useWorkbenchState(state => state.ir)
  const opened = useWorkbenchState(state => state.openFiles.length)

  useEffect(() => {
    const made = createEditor(parent.current!, {
      label: t.editor(''),
      onSave: () => void workbench.save(),
      onChange: (path, text) => workbench.recordEdit(path, text),
      onCursorLine: line => workbench.syncCursorLine(line),
      onSelect: selection => workbench.focusSourceSelection(selection),
    })
    editor.current = made
    const unbind = workbench.bindEditor({ text: path => made.text(path), replace: (path, text, fresh) => made.replace(path, text, fresh), focus: () => made.focus() })
    return () => {
      unbind()
      made.destroy()
      editor.current = undefined
    }
  }, [workbench])

  useEffect(() => {
    const made = editor.current
    if (!made) return
    for (const path of made.paths()) if (!workbench.state.openFiles.some(file => file.path === path)) made.forget(path)
    if (!activeFile) return
    made.show(activeFile, workbench.textOf(activeFile) ?? '')
  }, [activeFile, workbench, opened])

  useEffect(() => {
    if (activeFile) editor.current?.describe(t.editor(activeFile), t.editorKeys)
  }, [activeFile, t])

  useEffect(() => {
    if (reveal && reveal.path === activeFile) editor.current?.reveal(reveal.line, reveal.endLine, reveal.highlight)
  }, [reveal, activeFile])

  useEffect(() => {
    if (!activeFile || !editor.current) return
    const problems: Problem[] = (ir?.diagnostics ?? []).filter(finding => finding.source?.file === activeFile && finding.source.line).map(finding => ({ line: finding.source!.line!, severity: finding.severity === 'error' ? 'error' : finding.severity === 'warning' ? 'warning' : 'info', message: finding.message }))
    editor.current.setProblems(activeFile, problems)
  }, [ir, activeFile])

  return (
    <div className="pmw-source__editor" ref={parent} hidden={!activeFile} data-path={activeFile} />
  )
}
