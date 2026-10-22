import type { PreviewRenderer } from '@lincyaw/kernel'
import * as Tabs from '@radix-ui/react-tabs'
import type { ReactNode } from 'react'
import { PmIcon, PmIconButton, PmMenu } from '../components.tsx'
import { useMessages, useWorkbench, useWorkbenchState } from '../context.tsx'
import { isWorkspaceRootOpen } from '../workbench.ts'

/** The two panes of a document's editor; on a narrow screen one of them is shown at a time. */
export type DocumentPane = 'source' | 'preview'

export interface EditorGroupProps {
  split?: boolean
  compact?: boolean
  header?: boolean
  onNavigate?(pane: DocumentPane): void
}

/** Source files and rendered documents share one resource strip in each editor group. */
export function EditorGroup({ kind, split = false, compact = false, header = true, onNavigate, actions, children }: EditorGroupProps & { kind: DocumentPane, actions?: ReactNode, children: ReactNode }) {
  const t = useMessages()
  const workbench = useWorkbench()
  const openFiles = useWorkbenchState(state => state.openFiles)
  const activeFile = useWorkbenchState(state => state.activeFile)
  const renderer = useWorkbenchState(state => state.previewRenderer)
  const previews = useWorkbenchState(state => state.previewTabs)
  const noLecture = useWorkbenchState(isWorkspaceRootOpen)
  const slides = useWorkbenchState(state => Boolean(state.ir?.doc.config.renderers.slides))
  const previewName = (renderer: PreviewRenderer) => t.previewTab(t.renderers[renderer])
  const selectPreview = (renderer: PreviewRenderer, beside = split) => {
    workbench.openPreview(renderer, beside && !compact)
    onNavigate?.('preview')
  }
  const selected = kind === 'source' ? activeFile ? `file:${activeFile}` : '' : `preview:${renderer}`
  return <Tabs.Root className="pmw-editor-group" value={selected} onValueChange={value => {
    if (value.startsWith('file:')) {
      workbench.showFile(value.slice(5))
      if (compact) workbench.setLayout('source')
      onNavigate?.('source')
    } else selectPreview(value.slice(8) as PreviewRenderer)
  }}>
    <div className={`pmw-editor-group__bar${kind === 'preview' ? ' pmw-preview__bar' : ''}`} hidden={!header}>
      <Tabs.List className="pmw-editor-group__tabs" aria-label={t.editorTabs}>
        {(!split || kind === 'source') && openFiles.map(file => {
          const name = file.path.slice(file.path.lastIndexOf('/') + 1)
          return <span key={file.path} className="pmw-editor-group__tab" data-active={kind === 'source' && file.path === activeFile || undefined}>
            <Tabs.Trigger value={`file:${file.path}`} title={file.path}>
              <PmIcon name="document" size={14} /><span>{name}</span>
              {file.isDirty && <span className="pmw-source__dot" aria-label={t.unsaved} role="img" />}
            </Tabs.Trigger>
            <PmIconButton icon="close" label={t.closeFile(name)} small onClick={() => workbench.closeFile(file.path)} />
          </span>
        })}
        {(!split || kind === 'preview') && !noLecture && previews.map(preview => <span key={preview} className="pmw-editor-group__tab" data-active={kind === 'preview' && preview === renderer || undefined}>
          <Tabs.Trigger value={`preview:${preview}`}><PmIcon name={preview === 'web' ? 'document' : 'slides'} size={14} /><span>{previewName(preview)}</span></Tabs.Trigger>
          <PmIconButton icon="close" label={t.closeFile(previewName(preview))} small onClick={() => {
            workbench.closePreview(preview)
            if (!workbench.state.previewTabs.length) onNavigate?.('source')
          }} />
        </span>)}
      </Tabs.List>
      <div className="pmw-editor-group__actions">
        {actions}
        {!noLecture && <PmMenu icon="preview" label={t.openPreview} items={[
          { id: 'web', label: previewName('web'), icon: 'document' },
          { id: 'slides', label: previewName('slides'), icon: 'slides', disabled: !slides },
        ]} onSelect={value => selectPreview(value as PreviewRenderer)} />}
        {!noLecture && !compact && openFiles.length > 0 && (split
          ? kind === 'preview' && <PmIconButton icon="merge-panels" label={t.mergeEditors} small onClick={() => workbench.setLayout('preview')} />
          : <PmIconButton icon="split" label={t.previewBeside} small onClick={() => selectPreview(renderer, true)} />)}
      </div>
    </div>
    <Tabs.Content value={selected} forceMount className="pmw-editor-group__body">{children}</Tabs.Content>
  </Tabs.Root>
}
