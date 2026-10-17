/**
 * @presmium/workspace: the workspace service `presmium serve`, the sandbox
 * side `presmium agent-host`, and workspace builds (docs/architecture.md
 * section 10, docs/domain-model.md section 14). Node only; the browser
 * plugin is `./client`.
 */
export { buildWorkspace } from './node/build.ts'
export type { WorkspaceBuild } from './node/build.ts'
export { isWorkspaceRoot, listDocuments, readWorkspace } from './node/config.ts'
export type { FoundDocument, WorkspaceConfig } from './node/config.ts'
export { startAgentHost } from './node/agent-host.ts'
export type { AgentHost, AgentHostOptions } from './node/agent-host.ts'
export { serveWorkspace } from './node/serve.ts'
export type { ServeOptions, WorkspaceServer } from './node/serve.ts'
