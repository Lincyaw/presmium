/**
 * The workspace's browser plugin (P-120, P-121, docs/domain-model.md section
 * 14), the site's own plugin in `presmium serve`: it provides `EDIT_MODE`
 * and adds to the toolbar, for editors and owners only, the edit entry
 * (document pages), the document operations (the home page), and the
 * revision history with its reverts.
 */
import { EDIT_MODE, TOOLBAR, useServer } from '@presmium/host'
import { AGENT } from '@presmium/kernel'
import type { AgentClient, PluginDefinition, Unsubscribe } from '@presmium/kernel'
import { computed, readonly } from 'vue'
import { WORKSPACE_ID } from '../domain/api.ts'
import { mayEdit } from '../domain/members.ts'
import { Documents, EditToggle, editing, History, setAgent } from './panels.ts'

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
    const items = home
      ? [{ id: `${WORKSPACE_ID}.documents`, title: 'documents', component: Documents, order: 8 }]
      : [{ id: `${WORKSPACE_ID}.edit`, title: 'edit', component: EditToggle, order: 8 }]
    for (const item of [...items, { id: `${WORKSPACE_ID}.history`, title: 'history', component: History, order: 9 }]) unregister.push(toolbar.register(item))
  },
  dispose() {
    for (const off of unregister.splice(0)) off()
    editing.value = false
  },
}

export default workspacePlugin
