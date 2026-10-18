import { Group, Panel, Separator, usePanelRef } from 'react-resizable-panels'
import { useLayoutEffect } from 'react'
import { PmButton, PmIconButton, PmNotice, PmSegmented } from '../components.tsx'
import { useMessages, useWorkbench, useWorkbenchStore } from '../react.tsx'
import { ProblemsPanel } from './Problems.tsx'
import { PreviewPanel } from './Preview.tsx'
import { SourcePanel } from './Source.tsx'

export function DocumentView({ only }: { only?: 'source' | 'preview' }) {
  const t = useMessages()
  const workbench = useWorkbenchStore()
  const layout = useWorkbench(state => state.layout)
  const focus = useWorkbench(state => state.focus)
  const pending = useWorkbench(state => state.focusPending)
  const failure = useWorkbench(state => state.focusFailure)
  const home = useWorkbench(state => state.document === '' && state.documents?.single === false)
  const mode = home ? 'source' : only ?? layout
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
    <div className="pmw-document">
      {!only && !home && <div className="pmw-document__bar">
        <PmSegmented value={layout} label={t.documentLayout} options={[{ value: 'preview', label: t.preview }, { value: 'split', label: t.split }, { value: 'source', label: t.source }]} onChange={value => workbench.setLayout(value)} />
      </div>}
      {selected && <div className="pmw-focus" role="status" aria-label={t.focus} data-pending={pending || undefined}>
        <span className="pmw-focus__label">{pending ? t.focusSaving : t.focus}</span>
        <span className="pmw-focus__quote" title={label}>{label}</span>
        <PmIconButton icon="close" label={t.clearFocus} small onClick={() => workbench.setFocus([])} />
      </div>}
      {failure && <PmNotice tone="danger"><span>{t.focusFailed(failure)}</span><PmButton small onClick={() => workbench.setFocus(focus)}>{t.retryFocus}</PmButton></PmNotice>}
    <Group className="pmw-doc" data-only={single} disabled={Boolean(single)}>
      <Panel id="source" panelRef={source} collapsible collapsedSize={0} minSize="20%" className="pmw-doc__source" hidden={single === 'preview'}>
        <SourcePanel />
        <ProblemsPanel />
      </Panel>
      <Separator className="pmw-separator" aria-label={t.resize} hidden={Boolean(single)} />
      <Panel id="preview" panelRef={preview} collapsible collapsedSize={0} minSize="20%" className="pmw-doc__preview" hidden={single === 'source'}><PreviewPanel /></Panel>
    </Group>
    </div>
  )
}
