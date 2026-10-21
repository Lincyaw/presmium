import { useEffect, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { createEditor } from '../editor.ts'
import type { Problem, SourceEditor } from '../editor.ts'
import { PmButton, PmIconButton, PmNotice } from '../components.tsx'
import { useMessages, useWorkbench, useWorkbenchStore } from '../react.tsx'
import type { OpenFile } from '../store.ts'
import { EditorGroup } from './EditorGroup.tsx'
import type { EditorGroupProps } from './EditorGroup.tsx'

const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1)

export function SourcePanel(props: EditorGroupProps) {
  const t = useMessages()
  const workbench = useWorkbenchStore()
  const open = useWorkbench(state => state.open)
  const active = useWorkbench(state => state.active)
  const file = open.find(f => f.path === active)
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return
    event.preventDefault()
    void workbench.save()
  }
  return (
    <section className="pmw-source" aria-label={t.source} onKeyDown={onKeyDown}>
      <EditorGroup {...props} kind="source" actions={<SourceActions />}>
      {file?.notice && <FileNoticeBox file={file} />}
      <EditorPane />
      {!file && <p className="pmw-source__empty pmw-muted">{t.noFile}</p>}
      </EditorGroup>
    </section>
  )
}

export function SourceActions() {
  const t = useMessages()
  const workbench = useWorkbenchStore()
  const file = useWorkbench(state => state.open.find(file => file.path === state.active))
  return file && <PmIconButton small icon="save" label={t.save} disabled={!file.dirty} onClick={() => void workbench.save(file.path)} />
}

function FileNoticeBox({ file }: { file: OpenFile }) {
  const t = useMessages()
  const workbench = useWorkbenchStore()
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

function EditorPane() {
  const t = useMessages()
  const workbench = useWorkbenchStore()
  const parent = useRef<HTMLDivElement>(null)
  const editor = useRef<SourceEditor>(undefined)
  const active = useWorkbench(state => state.active)
  const reveal = useWorkbench(state => state.reveal)
  const ir = useWorkbench(state => state.ir)
  const opened = useWorkbench(state => state.open.length)

  useEffect(() => {
    const made = createEditor(parent.current!, {
      label: t.editor(''),
      save: () => void workbench.save(),
      changed: (path, text) => workbench.edited(path, text),
      moved: line => workbench.moved(line),
      selected: selection => workbench.selectSource(selection),
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
    for (const path of made.paths()) if (!workbench.state.open.some(file => file.path === path)) made.forget(path)
    if (!active) return
    made.show(active, workbench.textOf(active) ?? '')
  }, [active, workbench, opened])

  useEffect(() => {
    if (active) editor.current?.describe(t.editor(active), t.editorKeys)
  }, [active, t])

  useEffect(() => {
    if (reveal && reveal.path === active) editor.current?.reveal(reveal.line, reveal.endLine, reveal.mark)
  }, [reveal, active])

  useEffect(() => {
    if (!active || !editor.current) return
    const problems: Problem[] = (ir?.diagnostics ?? []).filter(finding => finding.source?.file === active && finding.source.line).map(finding => ({ line: finding.source!.line!, severity: finding.severity === 'error' ? 'error' : finding.severity === 'warning' ? 'warning' : 'info', message: finding.message }))
    editor.current.problems(active, problems)
  }, [ir, active])

  return (
    <div className="pmw-source__editor" ref={parent} hidden={!active} data-path={active} />
  )
}
