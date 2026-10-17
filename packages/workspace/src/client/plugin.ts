/**
 * The workspace's browser plugin (P-120, P-121, P-124, docs/domain-model.md
 * section 14), the site's own plugin in `presmium serve`: it provides
 * `EDIT_MODE` and adds to the shell, for editors and owners only
 * (docs/architecture.md 5.10, 5.11): on a document's page the edit switch,
 * and in edit mode the source editor (its pane, its files' tabs, the cursor's
 * line in the status bar) and "commit N changes"; on the home page the
 * document operations, the agent's draft card, the latest changes, the usage
 * guide, the file tree and the editor of the workspace's configuration; on
 * both the revision history with its undos and redos and the changes not
 * committed at its head, and the git status. `?edit=<path in the document>`
 * opens a document's page in edit mode at that file (the home page's file
 * tree links so).
 */
import { currentLocale, EDIT_MODE, TOOLBAR, useServer } from '@presmium/host'
import type { ToolbarItem } from '@presmium/host'
import { AGENT } from '@presmium/kernel'
import type { AgentClient, PluginDefinition, Unsubscribe } from '@presmium/kernel'
import { computed, readonly } from 'vue'
import { WORKSPACE_ID } from '../domain/api.ts'
import { mayEdit } from '../domain/members.ts'
import { WORKSPACE_MESSAGES } from '../domain/messages.ts'
import { CommitEntry, EditorStatus, FileTabs, FileTree, guardUnsaved, SourcePane } from './editing.ts'
import { Documents, DraftCard, EditToggle, GitStatus, Guide, History, NewDocument, RecentChanges, setAgent } from './panels.ts'
import { editing, requested } from './source.ts'

const unregister: Unsubscribe[] = []

export const workspacePlugin: PluginDefinition = {
  manifest: {
    id: WORKSPACE_ID,
    version: '0.1.0',
    kernel: '^0.1.0',
    provides: [EDIT_MODE],
    requires: [{ token: TOOLBAR, optional: true }, { token: AGENT, optional: true }],
  },
  setup(ctx) {
    const server = useServer()
    const allowed = computed(() => server.available && mayEdit(server.member.value?.roles))
    ctx.provide(EDIT_MODE, {
      active: readonly(editing),
      allowed,
      enter() {
        if (allowed.value) editing.value = true
      },
      leave() {
        editing.value = false
      },
    })
    setAgent(ctx.tryGet(AGENT) as AgentClient | undefined)
    const toolbar = ctx.tryGet(TOOLBAR)
    if (!toolbar || !server.available) return
    const home = ctx.config.home === true
    // A link to a file of the document: its page in edit mode, at the file.
    const asked = new URLSearchParams(location.search).get('edit')
    if (!home && asked) {
      requested.value = asked
      editing.value = true
      const url = new URL(location.href)
      url.searchParams.delete('edit')
      history.replaceState(history.state, '', url.pathname + url.search + url.hash)
    }
    unregister.push(guardUnsaved())
    const t = WORKSPACE_MESSAGES[currentLocale()]
    const id = (name: string) => `${WORKSPACE_ID}.${name}`
    const items: ToolbarItem[] = home
      ? [
          { id: id('documents'), title: t.documents, component: Documents, order: 8 },
          { id: id('new'), title: t.newDocument, component: NewDocument, order: 8.5 },
          { id: id('draft'), title: t.draftCard, component: DraftCard, order: 8, slot: 'create' },
          { id: id('recent'), title: t.recent, component: RecentChanges, order: 8, slot: 'home' },
          { id: id('guide'), title: t.guide, component: Guide, order: 1, slot: 'settings', icon: 'help' },
          { id: id('files'), title: t.fileTree, component: FileTree, slot: 'files' },
        ]
      : [
          { id: id('edit'), title: t.edit, component: EditToggle, order: 8 },
          { id: id('commit'), title: t.uncommitted, component: CommitEntry, order: 7 },
        ]
    items.push(
      { id: id('history'), title: t.history, component: History, order: 9, icon: 'history' },
      { id: id('git'), title: 'git', component: GitStatus, order: 0, slot: 'status' },
      { id: id('tabs'), title: t.openFiles, component: FileTabs, slot: 'tabs' },
      { id: id('source'), title: t.source, component: SourcePane, slot: 'source' },
      { id: id('cursor'), title: t.source, component: EditorStatus, order: 1, slot: 'status' },
    )
    for (const item of items) unregister.push(toolbar.register(item))
  },
  dispose() {
    for (const off of unregister.splice(0)) off()
    editing.value = false
  },
}

export default workspacePlugin
