/**
 * @presmium/mcp: the agent environment (P-110, docs/architecture.md 10.2).
 * The MCP service over the host interface it declares (`McpHost`); the server
 * mounts it at `/mcp` (section 3). `presmium-mcp` serves it on stdio over the
 * compiler. Its tool table (`TOOL_TABLE`, `listTools`) is the one both
 * adapters offer (decision G-3): MCP here, DeepSeek Harness tools in
 * `@presmium/dsh`, which uses the client side (`@presmium/mcp/client`).
 */
export type { McpCaller, McpDocument, McpFocus, McpHost, McpPluginTools, McpPosition, McpProcess } from './host.ts'
export { EXCERPT_LINES, excerptOf, focusReport, resolveFocus } from './focus.ts'
export { createPresmiumMcp, FOCUS_URI, listTools, MCP_VERSION, OPERATE_TOOLS, POSITION_URI, presmiumServer, READ_TOOLS, serveMcpStdio, TOOL_APPROVAL_META, TOOL_KIND_META, TOOL_TABLE } from './mcp.ts'
export type { McpToolInfo, PresmiumMcp } from './mcp.ts'
