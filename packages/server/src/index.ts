/**
 * @presmium/server: the server of `presmium dev` and `presmium serve`
 * (docs/architecture.md section 10). Node only; only the CLI and the
 * workspace use it (section 3).
 */
export { APPROVAL_TIMEOUT_MS, Control } from './control.ts'
export type { ApprovalPolicy, WindowPosition, WindowReport } from './control.ts'
export { servedDocument } from './host.ts'
export type { HostDocument, ServedDocument, ServedPlugin, ServerHost } from './host.ts'
export { anyAddress, networkAddresses } from './auth.ts'
export { bearer, isLoopback, json, limitBody, problem } from './http.ts'
export { LOCAL_AUTHOR, SERVER_PATH, startServer } from './server.ts'
export type { PresmiumServer, ServerOptions } from './server.ts'
