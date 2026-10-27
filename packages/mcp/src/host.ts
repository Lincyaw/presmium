import type { ProjectAuthoring, AuthoringClients, DocumentHistory } from '@lincyaw/kernel'
import type {
  AgentMode,
  AgentTool,
  ApprovalKind,
  ApprovalRequest,
  DiagnosticSnapshot,
  DocumentAuthoring,
  DocumentAudioAuthoring,
  DocumentVoiceAuthoring,
  DocumentTranscriptions,
  DocumentTranscriptionAdoption,
  DocumentSummary,
  Finding,
  Focus,
  IRDocument,
  Member,
  OutputJobs,
  RunResult,
  ServiceToken,
} from '@lincyaw/kernel'

export interface McpCaller {
  member: Member
  mode: AgentMode
  confirmed?: boolean
  document?: string
}

export interface McpFocus {
  document: string
  focus: Focus[]
  at: number
}

export interface McpPosition {
  document: string
  member: string
  slide: number
  section?: string
  step: number
  trail?: string[]
  view?: string
  role?: string
  at: number
}

export interface McpPluginTools {
  tools: AgentTool[]
  service<T>(token: ServiceToken<T>): T | undefined
}

export interface McpProcess {
  command: 'dev' | 'serve' | 'presmium-mcp'
}

export interface McpRuntimeWindow {
  window: string
  role?: string
  position?: { slide: number, section?: string, step: number, view?: string }
  reported: string
  status: Record<string, unknown>
}

export interface McpHost {
  projectAuthoring?: ProjectAuthoring
  authoring?: DocumentAuthoring
  documentHistory?: DocumentHistory
  authoringClients?: AuthoringClients
  audioAuthoring?: DocumentAudioAuthoring
  voiceAuthoring?: DocumentVoiceAuthoring
  transcriptions?: DocumentTranscriptions
  transcriptionAdoption?: DocumentTranscriptionAdoption
  process?: McpProcess
  documents(): Promise<DocumentSummary[]>
  compile(document: string): Promise<{ doc: IRDocument, diagnostics: Finding[] }>
  diagnostics?(document: string): Promise<DiagnosticSnapshot>
  watchDiagnostics?(listener: (document: string) => void): () => void
  check(document: string): Promise<Finding[]>
  build(document: string, options: { to?: string[] }): Promise<{ outputs: { renderer: string, outDir: string }[], findings: Finding[] }>
  /** The builds and exports as jobs the workbench shows, where the host runs them so (the workspace service). */
  jobs?: OutputJobs
  run(document: string, target: { section: string, block: string }, signal?: AbortSignal): Promise<RunResult>
  approve(request: ApprovalRequest, signal?: AbortSignal): Promise<boolean>
  offers(kind: ApprovalKind): boolean
  approval?(kind: ApprovalKind): 'off' | 'ask' | 'allow'
  tools?(document?: string): Promise<McpPluginTools>
  readyTools?(document?: string): McpPluginTools
  watchTools?(listener: (document: string) => void): () => void
  positions?(document: string | undefined, member: Member): McpPosition[]
  watchPositions?(listener: () => void): () => void
  focus?(document?: string): McpFocus | undefined
  watchFocus?(listener: () => void): () => void
  classroomStatus?(document: string): Record<string, unknown>
  runtime?(document: string): McpRuntimeWindow[]
  navigate?(document: string, position: { slide: number, step: number, view?: string, section?: string, trail?: string[] }, member: Member): number
  setClassroom?(document: string, action: 'start' | 'end', name: string | undefined, member: Member): number
}
