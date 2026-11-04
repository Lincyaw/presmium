import { errorMessage } from '@lincyaw/kernel'
import { compactToolCatalog, queryToolCatalog, resolveCatalogCall } from '@lincyaw/mcp/client'
import type { CalledImage, ListedTool } from '@lincyaw/mcp/client'
import type { DshAgent, DshAttachments, DshContentBlock, DshContext, DshImageMediaType, DshLlm, DshToolDefinition, DshToolExecution } from './dsh-types.ts'
import type { DocumentBinding } from './bindings.ts'

export const name = 'presmium-tools'
export const inject = ['presmium', 'tools']

export const PREFIX = 'presmium__'
export const CANDIDATE_TOOLS = new Set([
  'get_authoring_capabilities', 'get_document', 'get_document_outline', 'read_document_part',
  'plan_document_change', 'apply_document_change', 'plan_page_change', 'apply_page_change',
  'plan_page_duplication', 'apply_page_duplication', 'plan_authoring_action', 'apply_authoring_action', 'read_authoring_action_impact',
  'check_document', 'get_section', 'get_step', 'list_sections', 'deck_info', 'list_documents',
  'run_code', 'capture_slides', 'capture_reading', 'capture_overview',
])

/** New tools carry their routing with their schema; the names retain compatibility with older servers. */
export const isCandidateTool = (tool: ListedTool): boolean => tool.workspace ? tool.workspace === 'candidate' : CANDIDATE_TOOLS.has(tool.name)

export async function resolvePresmiumCall(binding: DocumentBinding | undefined, exec: Pick<DshToolExecution, 'name' | 'arguments'>) {
  if (!binding || !exec.name.startsWith(PREFIX)) throw new Error('operation-unavailable')
  const target = await resolveCatalogCall(binding.registeredTools ?? binding.tools, exec.name.slice(PREFIX.length), exec.arguments)
  if (!target.discovery && JSON.stringify(binding.tools.find(tool => tool.name === target.tool.name)) !== JSON.stringify(target.tool)) throw new Error('operation-definition-changed')
  return target
}

const IMAGE_TYPES = new Set<string>(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

/**
 * A tool result's images as dsh's durable image blocks, which reach the model beside the text; only when the model of
 * the session's latest request declares image input, as dsh's own MCP client does. Otherwise, and when the attachment
 * store refuses them, one line says they were left out (the text names their files where the tool has any) and the call
 * still succeeds.
 */
async function imageBlocks(ctx: DshContext, tool: string, images: CalledImage[], exec: DshToolExecution): Promise<DshContentBlock[]> {
  const leftOut = (why: string): DshContentBlock[] => [{ type: 'text', text: `[${images.length} image${images.length === 1 ? '' : 's'} not attached: ${why}]` }]
  const attachments = ctx.get('attachments') as DshAttachments | undefined
  const llm = ctx.get('llm') as DshLlm | undefined
  const { provider, model } = exec.agent?.session.requestContext() ?? {}
  if (!attachments || !llm || !provider || !model) return leftOut('this session takes no images')
  const info = await llm.resolveModelInfo(provider, model, exec.signal).catch(() => undefined)
  if (!info?.inputModalities?.includes('image')) return leftOut(`the model ${model} does not take images`)
  if (images.some(image => !IMAGE_TYPES.has(image.mimeType))) return leftOut('not PNG, JPEG, WebP or GIF')
  try {
    const refs = await attachments.saveImages(images.map((image, n) => ({ data: Buffer.from(image.data, 'base64'), mediaType: image.mimeType as DshImageMediaType, name: `${tool}-${n + 1}.${image.mimeType.slice('image/'.length)}` })))
    return refs.map(attachment => ({ type: 'image', attachment }))
  } catch (error) {
    return leftOut(errorMessage(error))
  }
}

function definition(ctx: DshContext, binding: DocumentBinding, tool: ListedTool): DshToolDefinition {
  const prepared = new Map<symbol, DshContentBlock[]>()
  return {
    name: `${PREFIX}${tool.name}`,
    description: tool.description,
    parameters: tool.inputSchema,
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
    async execute(args, exec) {
      if (exec.agent && ctx.presmium.bindings.bindingOf(exec.agent) !== binding) throw new Error('operation-binding-changed')
      const target = await resolvePresmiumCall(binding, { name: PREFIX + tool.name, arguments: args })
      if (target.discovery) return JSON.stringify(queryToolCatalog(binding.registeredTools ?? binding.tools, target.arguments))
      const result = await (isCandidateTool(target.tool) ? binding.client : binding.authorClient).call(target.tool.name, target.arguments, exec.signal)
      if (result.isError) throw new Error(result.text)
      if (result.images.length > 0) prepared.set(exec.token, [...result.text ? [{ type: 'text' as const, text: result.text }] : [], ...await imageBlocks(ctx, tool.name, result.images, exec)])
      return result.text
    },
    projectContent(exec, result) {
      const content = prepared.get(exec.token)
      prepared.delete(exec.token)
      return result.isError ? undefined : content
    },
  }
}

export function apply(ctx: DshContext): void {
  const live = new WeakSet<DshAgent>()
  const selections = new WeakMap<DshAgent, () => void>()
  const registered = new WeakMap<DshAgent, { binding?: DocumentBinding, tools?: ListedTool[], stop?: () => void, dispose: (() => void)[] }>()
  const install = (agent: DshAgent, binding: DocumentBinding | undefined) => {
    if (!live.has(agent) || ctx.presmium.bindings.bindingOf(agent) !== binding) return
    const previous = registered.get(agent)
    if (previous && previous.binding === binding && previous.tools === binding?.tools) return
    previous?.stop?.()
    for (const dispose of previous?.dispose ?? []) dispose()
    if (binding) binding.registeredTools = binding.tools
    registered.set(agent, {
      binding, tools: binding?.tools,
      stop: binding?.toolChanges.watch(() => { if (agent.status === 'idle') install(agent, binding) }),
      dispose: binding ? compactToolCatalog(binding.tools).map(tool => agent.ctx.tools.register(definition(ctx, binding, tool))) : [],
    })
  }
  const sync = async (agent: DshAgent) => {
    const binding = await ctx.presmium.bindings.syncBinding(agent)
    if (binding?.toolChanges.error) await binding.toolChanges.refresh()
    install(agent, binding)
  }
  ctx.on('agent/created', async ({ agent }: { agent: DshAgent }) => {
    live.add(agent)
    await sync(agent)
    if (!live.has(agent)) return
    selections.set(agent, ctx.presmium.bindings.watchSelection(agent.session.id, { before: () => agent.whenIdle(), after: () => sync(agent) }))
  })
  ctx.on('agent/disposed', ({ agent }: { agent: DshAgent }) => {
    live.delete(agent)
    selections.get(agent)?.(); selections.delete(agent)
    const previous = registered.get(agent)
    registered.delete(agent)
    previous?.stop?.()
    for (const dispose of previous?.dispose ?? []) dispose()
  })
  ctx.on('agent/pre-step', async ({ agent }: { agent: DshAgent }, next: () => Promise<unknown>) => {
    await ctx.presmium.bindings.refreshCandidate(agent)
    await sync(agent)
    return next()
  })
  ctx.on('agent/status', ({ agent, status }: { agent: DshAgent, status: DshAgent['status'] }) => {
    if (status === 'idle') install(agent, ctx.presmium.bindings.bindingOf(agent))
  })
}
