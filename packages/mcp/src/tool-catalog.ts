import { fromJsonSchema } from '@modelcontextprotocol/server'
import type { JsonSchemaType } from '@modelcontextprotocol/server'
import type { ListedTool } from './client.ts'
import { compactSchema, schemaArguments, schemaInputChoices, selectSchemaVariant } from './schemas.ts'

const COMMON = new Set(['get_context', 'rename_page', 'edit_narration', 'list_documents'])
const KINDS = ['read', 'operate', 'spend', 'write', 'agent'] as const
const dispatcher = (kind: ListedTool['kind']) => kind === 'operate' ? 'edit_operation' : `${kind}_operation`
const failure = (message: string, status = 400) => Object.assign(new Error(message), { status })
const QUERY_SCHEMA = { type: 'object', additionalProperties: false, properties: {
  name: { type: 'string' }, query: { type: 'string' }, variant: { type: 'string', minLength: 1, maxLength: 200 }, schema: { type: 'boolean' }, offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 20 },
} }
const CALL_SCHEMA = { type: 'object', additionalProperties: false, properties: {
  operation: { type: 'string', minLength: 1 }, arguments: { type: 'object', additionalProperties: true },
}, required: ['operation'] }

/** One catalog definition for MCP and trusted Harness hosts; the complete inventory stays host-side. */
export function compactToolCatalog(tools: readonly ListedTool[]): ListedTool[] {
  return [{ name: 'operations', kind: 'read', description: 'Find operations by query, or inspect one by name. Generated summaries list variants; select variant for only that action’s arguments. Use schema:true for its full definition.', inputSchema: QUERY_SCHEMA },
    ...KINDS.filter(kind => tools.some(tool => tool.kind === kind)).map(kind => ({ name: dispatcher(kind), kind,
      description: `Run a discovered ${kind} operation. Its schema, permissions and approvals apply.`, inputSchema: CALL_SCHEMA })),
    ...tools.filter(tool => COMMON.has(tool.name))]
}

async function validate(schema: Record<string, unknown>, args: unknown): Promise<Record<string, unknown>> {
  const parsed = await fromJsonSchema<Record<string, unknown>>(compactSchema(schema) as JsonSchemaType)['~standard'].validate(args)
  if (parsed.issues) throw Object.assign(failure('operation-arguments-invalid'), { detail: { issues: parsed.issues.slice(0, 3).map(issue => issue.message.slice(0, 160)) } })
  return parsed.value
}

export interface CatalogCall { tool: ListedTool, arguments: Record<string, unknown>, discovery?: true }
/** Resolve before policy and again before dispatch. Arguments are never rewritten on the Harness execution. */
export async function resolveCatalogCall(tools: readonly ListedTool[], name: string, args: unknown): Promise<CatalogCall> {
  if (name === 'operations') {
    const tool = compactToolCatalog(tools)[0]!
    return { tool, arguments: await validate(QUERY_SCHEMA, args ?? {}), discovery: true }
  }
  const kind = KINDS.find(kind => dispatcher(kind) === name)
  let target = name, input = args ?? {}
  if (kind) {
    const wrapper = await validate(CALL_SCHEMA, input)
    target = String(wrapper.operation); input = wrapper.arguments ?? {}
  }
  const tool = tools.find(tool => tool.name === target && (!kind || tool.kind === kind))
  if (!tool) throw failure('operation-unavailable', 404)
  return { tool, arguments: await validate(tool.inputSchema, input) }
}

export function queryToolCatalog(tools: readonly ListedTool[], args: Record<string, unknown>): Record<string, unknown> {
  const description = (tool: ListedTool) => tool.description.slice(0, 180)
  if (typeof args.name === 'string') {
    const tool = tools.find(tool => tool.name === args.name)
    if (!tool) throw failure('operation-unavailable', 404)
    const schema = typeof args.variant === 'string' ? selectSchemaVariant(tool.inputSchema, args.variant) : compactSchema(tool.inputSchema)
    const inputChoices = schemaInputChoices(schema)
    return { name: tool.name, kind: tool.kind, description: description(tool), ...args.schema ? { inputSchema: schema } : { arguments: schemaArguments(schema), ...inputChoices ? { inputChoices } : {} } }
  }
  if (args.schema || args.variant !== undefined) throw failure('operation-name-required')
  const query = String(args.query ?? '').toLowerCase(), offset = Number(args.offset ?? 0), limit = Number(args.limit ?? 10)
  const found = tools.filter(tool => `${tool.name} ${tool.description}`.toLowerCase().includes(query))
    .sort((a, b) => Number(COMMON.has(b.name)) - Number(COMMON.has(a.name)))
  return { operations: found.slice(offset, offset + limit).map(tool => ({ name: tool.name, kind: tool.kind, description: description(tool) })),
    ...offset + limit < found.length ? { next: offset + limit } : {} }
}
