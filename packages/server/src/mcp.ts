/**
 * The `McpHost` of the server (docs/architecture.md 10.2): the documents and
 * host operations of its `ServerHost`, the windows' positions and status
 * summaries of the control channel, its approvals, and the agent tools of the
 * documents' plugins. `/mcp` mounts `@presmium/mcp` over it.
 */
import type { AgentTool, Member, ServiceToken } from '@presmium/kernel'
import type { McpHost, McpPluginTools, McpPosition } from '@presmium/mcp'
import type { Control } from './control.ts'
import type { FocusStore } from './focus.ts'
import type { ServedDocument, ServerHost } from './host.ts'

export interface McpHostOptions {
  serverHost?: ServerHost
  control: Control
  /** `presmium dev` or `presmium serve`, for the service's instructions. */
  command: 'dev' | 'serve'
  /** A served document, its contributions made on its first request; undefined when there is none. */
  mount(document: string): Promise<ServedDocument | undefined>
  /** The documents mounted so far. */
  mounted(): Promise<ServedDocument[]>
  /** The server's own Node services, in front of the document's. */
  service<T>(token: ServiceToken<T>): T | undefined
  /** The focus the workbench reported (`presmium.server/focus`). */
  focus: FocusStore
}

function toolsOf(documents: ServedDocument[], own: McpHostOptions['service']): McpPluginTools {
  const tools = new Map<string, AgentTool>()
  for (const doc of documents) {
    for (const { plugin } of doc.plugins) for (const tool of plugin.tools ?? []) if (!tools.has(tool.name)) tools.set(tool.name, tool)
  }
  const doc = documents[0]
  return { tools: [...tools.values()], service: <T>(token: ServiceToken<T>) => own(token) ?? doc?.service(token) }
}

export function serverMcpHost(options: McpHostOptions): McpHost {
  const { control } = options
  const host = (): ServerHost => {
    if (!options.serverHost) throw new Error('this server has no host operations')
    return options.serverHost
  }
  const position = (entry: ReturnType<Control['positions']>[number]): McpPosition => {
    const { report } = entry
    const { slide, step, view, section, trail } = report.position!
    return { document: entry.document, member: entry.member, slide, step, view, ...section === undefined ? {} : { section }, ...trail ? { trail } : {}, role: report.role, at: report.at }
  }
  return {
    process: { command: options.command },
    documents: () => host().documents(),
    compile: document => host().compile(document),
    check: document => host().check(document),
    build: (document, build) => host().build(document, build),
    run: (document, target, signal) => host().run(document, target, signal),
    approve: (request, signal) => control.approvals.request(request, signal),
    offers: kind => control.policy(kind) !== 'off',
    approval: kind => control.policy(kind),
    async tools(document) {
      if (document === undefined) return toolsOf(await options.mounted(), options.service)
      const doc = await options.mount(document)
      return toolsOf(doc ? [doc] : [], options.service)
    },
    // The member's presenting windows first, then those of editors and owners, then any window (10.4, F-38).
    positions(document: string | undefined, member: Member) {
      const all = control.positions(undefined, document, member)
      const presenting = (w: typeof all[number]) => w.member === member.id && (w.report.role === 'presenter' || w.report.role === 'audience')
      return [...all.filter(presenting), ...all.filter(w => !presenting(w))].map(position)
    },
    watchPositions: listener => control.watch(listener),
    focus: document => options.focus.get(document),
    watchFocus: listener => options.focus.watch(listener),
    classroom: document => control.status(document),
    navigate: (document, to, member) => control.go(to, member, document),
    session: (document, action, name, member) => control.session(action, name, document, member),
  }
}
