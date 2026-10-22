import { Group, Panel, Separator, usePanelRef } from 'react-resizable-panels'
import { useLayoutEffect } from 'react'
import { PmButton, PmIconButton, PmNotice } from '../components.tsx'
import { useMessages, useWorkbench, useWorkbenchState } from '../context.tsx'
import { EditorGroup } from '../parts/EditorGroup.tsx'
import type { DocumentPane } from '../parts/EditorGroup.tsx'
import { isWorkspaceRootOpen } from '../workbench.ts'
import { ProblemsPanel } from './ProblemsPanel.tsx'
import { PreviewActions, PreviewPanel } from './PreviewPanel.tsx'
import { SourceActions, SourcePanel } from './SourcePanel.tsx'

/** The editor of the open document: its source and its preview (side by side or one of them), the focus tray and the problems. */
export function DocumentEditor({ only, active = true, onNavigate }: { only?: DocumentPane, active?: boolean, onNavigate?(pane: DocumentPane): void }) {
  const t = useMessages()
  const workbench = useWorkbench()
  const layout = useWorkbenchState(state => state.layout)
  const focus = useWorkbenchState(state => state.focus)
  const pending = useWorkbenchState(state => state.isFocusPending)
  const failure = useWorkbenchState(state => state.focusFailure)
  const noLecture = useWorkbenchState(isWorkspaceRootOpen)
  const mode = noLecture ? 'source' : only && layout === 'split' ? only : layout
  const single = mode === 'split' ? undefined : mode
  const selected = focus[0]
  const label = selected?.quote ?? selected?.section ?? selected?.source?.file
  const source = usePanelRef()
  const preview = usePanelRef()
  useLayoutEffect(() => {
    if (mode === 'preview') source.current?.collapse()
    else source.current?.expand()
    if (mode === 'source') preview.current?.collapse()
    else preview.current?.expand()
  }, [mode, source, preview])
  return (
    <div className="pmw-document" onKeyDown={event => {
      if (event.defaultPrevented || mode === 'preview' || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return
      event.preventDefault()
      void workbench.save()
    }}>
      {failure && <PmNotice tone="danger"><span>{t.focusFailed(failure)}</span><PmButton small onClick={() => workbench.setFocus(focus)}>{t.retryFocus}</PmButton></PmNotice>}
    <EditorGroup kind={mode === 'preview' ? 'preview' : 'source'} header={mode !== 'split'} compact={Boolean(only)} onNavigate={onNavigate} actions={mode === 'preview' ? <PreviewActions /> : <SourceActions />}>
    <Group className="pmw-doc" data-only={single} disabled={Boolean(single)}>
      <Panel id="source" panelRef={source} collapsible collapsedSize={0} minSize="20%" className="pmw-doc__source" hidden={single === 'preview'}>
        <SourcePanel header={mode === 'split'} split={mode === 'split'} compact={Boolean(only)} onNavigate={onNavigate} />
      </Panel>
      <Separator className="pmw-separator" aria-label={t.resize} hidden={Boolean(single)} />
      <Panel id="preview" panelRef={preview} collapsible collapsedSize={0} minSize="20%" className="pmw-doc__preview" hidden={single === 'source'}><PreviewPanel header={mode === 'split'} split={mode === 'split'} compact={Boolean(only)} onNavigate={onNavigate} active={active && mode !== 'source'} /></Panel>
    </Group>
    </EditorGroup>
    {selected && <div className="pmw-focus" role="status" aria-label={t.focus} data-pending={pending || undefined}>
      <span className="pmw-focus__label">{pending ? t.focusSaving : t.focus}</span>
      <span className="pmw-focus__quote" title={label}>{label}</span>
      <PmIconButton icon="close" label={t.clearFocus} small onClick={() => workbench.setFocus([])} />
    </div>}
    <ProblemsPanel compact />
    </div>
  )
}
