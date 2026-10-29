import { lazy, Suspense, useState } from 'react'
import { PmMenu, PmNotice, PmSkeleton } from '@lincyaw/workbench/components'
import type { HistoryRevision } from '@lincyaw/kernel'
import { spacePath } from './api.ts'
import type { EditorDescriptor, Locale, Space } from './api.ts'
import { ResourceState } from './components.tsx'
import { PublicationDialog, RestoreVersionDialog } from './DocumentDialogs.tsx'
import { useResource } from './hooks.ts'
import type { Messages } from './messages.ts'

const NativeEditor = lazy(() => import('./NativeEditor.tsx'))

/** Cloud owns the route and sharing permissions; Studio owns the complete document view. */
export function DocumentPage({ space, id, t, locale, dark, onBack, registerBeforeLeave }: { space: Space, id: string, t: Messages, locale: Locale, dark: boolean, onBack(): void, registerBeforeLeave(leave?: () => Promise<void>): void }) {
  const resource = useResource<EditorDescriptor>(spacePath(space.id, `documents/${encodeURIComponent(id)}/editor`))
  const [publications, setPublications] = useState(false), [restoring, setRestoring] = useState<HistoryRevision>()
  return <div className="pmc-editor">
    <ResourceState resource={resource} t={t}>{resource.data?.available && resource.data.apiBase && resource.data.document !== undefined ? <Suspense fallback={<PmSkeleton label={t.editorConnecting} />}><NativeEditor
      key={`${space.id}:${id}:${resource.data.apiBase}`}
      descriptor={resource.data} locale={locale} dark={dark}
      registerBeforeLeave={registerBeforeLeave} onBack={onBack}
      historyRevisionAction={{ label: t.restoreSnapshot, icon: 'versions', disabled: space.role === 'reader', onSelect: setRestoring }}
      actions={<><PmMenu toolbarItem label={t.documentActions} items={[{ id: 'publication', icon: 'website', label: t.publications }]} onSelect={() => setPublications(true)} />
        {publications && <PublicationDialog space={space} documentId={id} t={t} locale={locale} onClose={() => setPublications(false)} />}
        {restoring && <RestoreVersionDialog space={space} documentId={id} revision={restoring} t={t} locale={locale} onClose={() => setRestoring(undefined)} />}
      </>}
    /></Suspense> : <PmNotice tone="warn">{t.editorUnavailable}</PmNotice>}</ResourceState>
  </div>
}
