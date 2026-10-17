/**
 * @presmium/server: the server of `presmium dev` and `presmium serve`, and
 * `presmium gateway` (docs/architecture.md section 10). Node only; only the
 * CLI and the workspace use it (section 3).
 */
export { APPROVAL_TIMEOUT_MS, Control } from './control.ts'
export type { ApprovalPolicy, WindowPosition, WindowReport } from './control.ts'
export { startGateway } from './gateway.ts'
export type { Gateway, GatewayOptions } from './gateway.ts'
export { servedDocument } from './host.ts'
export type { DocumentView, HostDocument, ServedDocument, ServedPlugin, ServerHost } from './host.ts'
export { bearer, hostname, isLoopback, json, limitBody, problem, sameSecret } from './http.ts'
export { LOCAL_AUTHOR, SERVER_PATH, startServer } from './server.ts'
export type { Identity, PresmiumServer, ServerOptions } from './server.ts'
export { GatewayTokens } from './tokens.ts'
export type { ScopedToken, TokenRequest } from './tokens.ts'
export { assertUnreadable, credentialVariables, dropPrivileges, readSecret, secretFiles, sharedSetup } from './trust.ts'
export type { SharedSetup } from './trust.ts'
