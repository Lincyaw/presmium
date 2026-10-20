import { isAbsoluteWorkspacePath, parseFileAddress, resolveWorkspacePath, workspaceTitleOf } from '@deepseek-ai/dsh-util-workspace-path'
import type { Workbench } from '@lincyaw/workbench'
import { useLayoutEffect, useRef, useSyncExternalStore } from 'react'

const ID = '@lincyaw/dsh/source'
// These formats keep Harness's rich previews. Text files share the workbench editor.
const PREVIEW = /\.(?:png|jpe?g|gif|webp|avif|ico|bmp|svg|pdf|html?|csv|tsv|wasm|zip|gz|tgz|bz2|xz|7z|woff2?|ttf|otf|eot|mp3|mp4|m4a|wav|ogg|oga|webm|mov|avi|mkv|bin|so|dylib|dll|exe|pyc|xlsx?|docx?|pptx?|parquet|npy|npz|pkl|db|sqlite)$/i
const RESERVED = new Set(['node_modules', 'dist', '.git', '.presmium'])

function normalized(path: string): string | undefined {
  const parts: string[] = []
  for (const part of path.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (!parts.length || parts.at(-1)?.endsWith(':')) return
      parts.pop()
    } else parts.push(part)
  }
  return `${path.startsWith('/') ? '/' : ''}${parts.join('/')}`
}

/** Use the Harness resolver for file links and line references, then open the canonical editor. */
export function sourceLinks(ctx: DshClientContext, workbench: Workbench, showEditor: (layout: DshClientContext['layout']) => void): void {
  ctx.inject(['sidebarRightTabs', 'sidebarRight', 'sessions', 'layout'], inner => inner.effect(() => {
    let root: string | undefined
    let active = true
    void workbench.client.workbench().then(answer => { if (active && answer.root) root = normalized(answer.root) }).catch(() => {})
    const locate = (address: string): { path: string, document: string } | undefined => {
      const file = parseFileAddress(address)
      if (!root || file?.scope !== 'session') return
      const session = inner.sessions.list.getSnapshot().byId[file.sessionId]
      if (!session?.cwd || normalized(session.cwd) !== root || PREVIEW.test(file.path)) return
      const absolute = normalized(resolveWorkspacePath(session.cwd, file.path))
      if (!absolute || !isAbsoluteWorkspacePath(absolute) || !absolute.startsWith(`${root}/`)) return
      const path = absolute.slice(root.length + 1)
      if (path.split('/').some(part => RESERVED.has(part))) return
      const documents = workbench.state.documents
      if (!documents) return
      const document = [...documents.documents].sort((a, b) => b.dir.length - a.dir.length).find(doc => !doc.dir || path.startsWith(`${doc.dir}/`))?.dir
      if (document === undefined && documents.single) return
      return { path, document: document ?? '' }
    }
    function SourceLink({ useTabInfo }: DshSourceTabProps) {
      const { tab } = useTabInfo()
      const opened = useRef<number>()
      useLayoutEffect(() => {
        if (!tab.visible || opened.current === tab.navigation.revision) return
        const target = locate(tab.contentId)
        if (!target) return
        opened.current = tab.navigation.revision
        const line = tab.navigation.params?.line
        tab.actions.close()
        if (inner.sidebarRight.isExpanded()) inner.sidebarRight.toggleExpanded()
        showEditor(inner.layout)
        void workbench.openSource(target.document, target.path, typeof line === 'number' && Number.isInteger(line) && line > 0 ? { line, mark: true } : undefined)
      }, [tab.visible, tab.contentId, tab.navigation.revision])
      return <span data-pmw-source-route="" hidden />
    }
    // Previously saved Harness text tabs keep their kind when restored. Route those too.
    function RestoredSource({ absolutePath }: { absolutePath: string }) {
      const documents = useSyncExternalStore(workbench.subscribe, () => workbench.state.documents)
      useLayoutEffect(() => {
        const tab = inner.sidebarRight.active()
        if (tab?.kind !== 'text') return
        const target = locate(tab.contentId)
        if (!target || normalized(absolutePath) !== normalized(resolveWorkspacePath(root, target.path))) return
        inner.sidebarRight.close(tab.id)
        if (inner.sidebarRight.isExpanded()) inner.sidebarRight.toggleExpanded()
        showEditor(inner.layout)
        void workbench.openSource(target.document, target.path)
      }, [absolutePath, documents])
      return null
    }
    const offType = inner.sidebarRightTabs.register({ id: ID, kind: 'presmium-source-link', priority: 'extension', patterns: ['dsh-resource://file/session/**'], canOpen: address => Boolean(locate(address)), title: (address = '') => workspaceTitleOf(parseFileAddress(address)?.path ?? address) })
    let offBody: (() => void) | undefined
    inner.slots.inject('sidebar.right.pane.tab', () => { offBody = inner.slots.register({ name: 'sidebar.right.pane.tab', key: ID }, SourceLink) })
    let offRestored: (() => void) | undefined
    inner.slots.inject('sidebar.right.tab.document.actions', () => { offRestored = inner.slots.register({ name: 'sidebar.right.tab.document.actions', id: ID }, RestoredSource) })
    return () => { active = false; offRestored?.(); offBody?.(); offType() }
  }, 'presmium: shared source editor'))
}
