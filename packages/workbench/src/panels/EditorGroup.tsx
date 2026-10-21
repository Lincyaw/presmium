import * as Tabs from '@radix-ui/react-tabs'
import type { ReactNode } from 'react'
import { PmIcon, PmIconButton, PmMenu } from '../components.tsx'
import { useMessages, useWorkbench, useWorkbenchStore } from '../react.tsx'
import type { PreviewView } from '../store.ts'

export interface EditorGroupProps {
  split?: boolean
  compact?: boolean
  header?: boolean
  onNavigate?(view: 'source' | 'preview'): void
}

/** Source files and rendered documents share one resource strip in each editor group. */
export function EditorGroup({ kind, split = false, compact = false, header = true, onNavigate, actions, children }: EditorGroupProps & { kind: 'source' | 'preview', actions?: ReactNode, children: ReactNode }) {
  const t = useMessages()
  const workbench = useWorkbenchStore()
  const open = useWorkbench(state => state.open)
  const active = useWorkbench(state => state.active)
  const view = useWorkbench(state => state.view)
  const previews = useWorkbench(state => state.previewTabs)
  const home = useWorkbench(state => state.document === '' && state.documents?.single === false)
  const slides = useWorkbench(state => Boolean(state.ir?.doc.config.renderers.slides))
  const previewName = (view: PreviewView) => t.previewTab(t.views[view])
  const selectPreview = (view: PreviewView, beside = split) => {
    workbench.openPreview(view, beside && !compact)
    onNavigate?.('preview')
  }
  const selected = kind === 'source' ? active ? `file:${active}` : '' : `preview:${view}`
  return <Tabs.Root className="pmw-editor-group" value={selected} onValueChange={value => {
    if (value.startsWith('file:')) {
      workbench.showFile(value.slice(5))
      if (compact) workbench.setLayout('source')
      onNavigate?.('source')
    } else selectPreview(value.slice(8) as PreviewView)
  }}>
    <div className={`pmw-editor-group__bar${kind === 'preview' ? ' pmw-preview__bar' : ''}`} hidden={!header}>
      <Tabs.List className="pmw-editor-group__tabs" aria-label={t.editorTabs}>
        {(!split || kind === 'source') && open.map(file => {
          const name = file.path.slice(file.path.lastIndexOf('/') + 1)
          return <span key={file.path} className="pmw-editor-group__tab" data-active={kind === 'source' && file.path === active || undefined}>
            <Tabs.Trigger value={`file:${file.path}`} title={file.path}>
              <PmIcon name="document" size={14} /><span>{name}</span>
              {file.dirty && <span className="pmw-source__dot" aria-label={t.unsaved} role="img" />}
            </Tabs.Trigger>
            <PmIconButton icon="close" label={t.closeFile(name)} small onClick={() => workbench.closeFile(file.path)} />
          </span>
        })}
        {(!split || kind === 'preview') && !home && previews.map(preview => <span key={preview} className="pmw-editor-group__tab" data-active={kind === 'preview' && preview === view || undefined}>
          <Tabs.Trigger value={`preview:${preview}`}><PmIcon name={preview === 'web' ? 'document' : 'slides'} size={14} /><span>{previewName(preview)}</span></Tabs.Trigger>
          <PmIconButton icon="close" label={t.closeFile(previewName(preview))} small onClick={() => {
            workbench.closePreview(preview)
            if (!workbench.state.previewTabs.length) onNavigate?.('source')
          }} />
        </span>)}
      </Tabs.List>
      <div className="pmw-editor-group__actions">
        {actions}
        {!home && <PmMenu icon="preview" label={t.openPreview} items={[
          { id: 'web', label: previewName('web'), icon: 'document' },
          { id: 'slides', label: previewName('slides'), icon: 'slides', disabled: !slides },
        ]} onSelect={value => selectPreview(value as PreviewView)} />}
        {!home && !compact && open.length > 0 && (split
          ? kind === 'preview' && <PmIconButton icon="merge-panels" label={t.mergeEditors} small onClick={() => workbench.setLayout('preview')} />
          : <PmIconButton icon="split" label={t.previewBeside} small onClick={() => selectPreview(view, true)} />)}
      </div>
    </div>
    <Tabs.Content value={selected} forceMount className="pmw-editor-group__body">{children}</Tabs.Content>
  </Tabs.Root>
}
