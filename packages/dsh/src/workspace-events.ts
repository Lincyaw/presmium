import { z } from 'zod'

/** One authenticated Studio socket carries these existing workspace subscriptions. */
export const WORKSPACE_EVENTS_PATH = '/api/presmium/events'
export const WORKSPACE_EVENT_TOPICS = ['document', 'diagnostics', 'review', 'ir', 'jobs'] as const
const subscriptionId = z.string().min(1).max(80)

const viewerSite = z.strictObject({ type: z.literal('subscribe'), id: subscriptionId, topic: z.literal('viewer-site'), document: z.string().max(1024), app: z.string().max(200), lang: z.string().max(80), form: z.enum(['web', 'slides']) })
const viewerControl = z.strictObject({ type: z.literal('subscribe'), id: subscriptionId, topic: z.literal('viewer-control'), document: z.string().max(1024), window: z.string().regex(/^[a-zA-Z0-9-]{1,80}$/) })

export const workspaceEventCommand = z.union([
  z.strictObject({ type: z.literal('subscribe'), id: subscriptionId, topic: z.literal('authoring-client'), document: z.string().max(1024), clientId: subscriptionId, epoch: subscriptionId, snapshot: z.unknown() }),
  z.strictObject({ type: z.literal('authoring-client-publish'), id: subscriptionId, connectionId: subscriptionId, sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), kind: z.enum(['state', 'ack']), value: z.unknown() }),
  viewerSite, viewerControl,
  z.strictObject({ type: z.literal('subscribe'), id: subscriptionId, topic: z.enum(WORKSPACE_EVENT_TOPICS), document: z.string().max(1024) }),
  z.strictObject({ type: z.literal('unsubscribe'), id: subscriptionId }),
])

/** Ready describes the actual upstream connection, rather than a fabricated domain snapshot. */
export const workspaceEventMessage = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('published'), id: subscriptionId, sequence: z.number().int().nonnegative(), ok: z.boolean() }),
  z.strictObject({ type: z.literal('ready'), id: subscriptionId }),
  z.strictObject({ type: z.literal('error'), id: subscriptionId }),
  z.strictObject({ type: z.literal('event'), id: subscriptionId, event: z.string().max(40).optional(), data: z.string() }),
])

export type WorkspaceEventTopic = typeof WORKSPACE_EVENT_TOPICS[number] | 'viewer-site' | 'viewer-control' | 'authoring-client'
export type WorkspaceEventCommand = z.infer<typeof workspaceEventCommand>
export type WorkspaceEventMessage = z.infer<typeof workspaceEventMessage>
