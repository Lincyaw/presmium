import { dirname } from 'node:path'
import { errorMessage, isPresentingRole } from '@lincyaw/kernel'
import type { AgentTool, Member, ServiceToken } from '@lincyaw/kernel'
import type { McpHost, McpPluginTools, McpPosition } from '@lincyaw/mcp'
import type { ControlChannel } from './control.ts'
import type { FocusStore } from './focus.ts'
import type { DiagnosticStore } from './diagnostics.ts'
import type { ServedDocument, ServerHost } from './server-host.ts'

export interface McpHostOptions {
  serverHost?: ServerHost
  control: ControlChannel
  command: 'dev' | 'serve'
  mount(document: string): Promise<ServedDocument | undefined>
  mounted(): Promise<ServedDocument[]>
  service<T>(token: ServiceToken<T>): T | undefined
  focus: FocusStore
  diagnostics: DiagnosticStore
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
  const position = (entry: ReturnType<ControlChannel['positions']>[number]): McpPosition => {
    const { report } = entry
    const { slide, step, view, section, trail } = report.position!
    return { document: entry.document, member: entry.member, slide, step, view, ...section === undefined ? {} : { section }, ...trail ? { trail } : {}, role: report.role, at: report.at }
  }
  return {
    process: { command: options.command },
    get authoring() { return options.serverHost?.authoring },
    readyTools: document => options.serverHost?.agentTools?.(document) ?? { tools: [], service: options.service },
    watchTools: listener => options.serverHost?.watchAgentTools?.(listener) ?? (() => {}),
    documents: () => host().documents(),
    compile: document => host().compile(document),
    async check(document) {
      const { doc } = await host().compile(document)
      const irRevision = options.diagnostics.irRevision(document)
      const findings = await host().check(document)
      if (irRevision === options.diagnostics.irRevision(document)) {
        const compiled = new Set(doc.diagnostics.map(finding => JSON.stringify(finding)))
        options.diagnostics.replace({ document, origin: 'check' }, findings.filter(finding => !compiled.has(JSON.stringify(finding))), { root: host().workspaceRoot ?? dirname(doc.meta.entry), irRevision })
      }
      return findings
    },
    build: (document, build) => host().build(document, build),
    get jobs() {
      return options.serverHost?.jobs
    },
    run: (document, target, signal) => host().run(document, target, signal),
    approve: (request, signal) => control.approvals.request(request, signal),
    offers: kind => control.policy(kind) !== 'off',
    approval: kind => control.policy(kind),
    async tools(document) {
      if (document === undefined) return toolsOf(await options.mounted(), options.service)
      const doc = await options.mount(document)
      return toolsOf(doc ? [doc] : [], options.service)
    },
    positions(document: string | undefined, member: Member) {
      const all = control.positions({ document, viewer: member })
      const presenting = (w: typeof all[number]) => w.member === member.id && isPresentingRole(w.report.role)
      return [...all.filter(presenting), ...all.filter(w => !presenting(w))].map(position)
    },
    watchPositions: listener => control.watch(listener),
    focus: document => options.focus.find(document),
    watchFocus: listener => options.focus.watch(listener),
    async diagnostics(document) {
      if (!options.diagnostics.isObserved(document) && !options.serverHost?.authoring) {
        try {
          const { doc } = await host().compile(document)
          if (!options.diagnostics.isObserved(document)) options.diagnostics.compiled(document, doc, host().workspaceRoot ?? dirname(doc.meta.entry))
        } catch (error) {
          if (!options.diagnostics.isObserved(document)) options.diagnostics.failed(document, errorMessage(error))
        }
      }
      return options.diagnostics.snapshot(document)
    },
    watchDiagnostics: listener => options.diagnostics.watch(listener),
    classroomStatus: document => control.status(document),
    runtime: document => control.runtime(document).map(({ window, report }) => ({ window, role: report.role, position: report.position, reported: new Date(report.at).toISOString(), status: report.status ?? {} })),
    navigate: (document, to, member) => control.go(to, { member, document }),
    setClassroom: (document, action, name, member) => control.setClassroom(action, name, { document, member }),
  }
}
