/**
 * @presmium/mcp: the agent environment (P-110, docs/architecture.md 10.2).
 * The MCP service over the host interface it declares (`McpHost`); only the
 * server uses it, which mounts it at `/mcp` (section 3). `presmium-mcp` serves
 * it on stdio over the compiler.
 */
export type { McpCaller, McpDocument, McpHost, McpPluginTools, McpPosition, McpView } from './host.ts'
export { createPresmiumMcp, MCP_VERSION, OPERATE_TOOLS, POSITION_URI, presmiumServer, READ_TOOLS, serveMcpStdio } from './mcp.ts'
export type { PresmiumMcp } from './mcp.ts'
