import { z } from 'zod'

/** One authenticated Studio socket carries these existing workspace subscriptions. */
export const WORKSPACE_EVENTS_PATH = '/api/presmium/events'
export const WORKSPACE_EVENT_TOPICS = ['document', 'diagnostics', 'review', 'ir', 'jobs'] as const
const subscriptionId = z.string().min(1).max(80)

export const workspaceEventCommand = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('subscribe'), id: subscriptionId, topic: z.enum(WORKSPACE_EVENT_TOPICS), document: z.string().max(1024) }),
  z.strictObject({ type: z.literal('unsubscribe'), id: subscriptionId }),
])

/** Ready describes the actual upstream connection, rather than a fabricated domain snapshot. */
export const workspaceEventMessage = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('ready'), id: subscriptionId }),
  z.strictObject({ type: z.literal('error'), id: subscriptionId }),
  z.strictObject({ type: z.literal('event'), id: subscriptionId, data: z.string() }),
])

export type WorkspaceEventTopic = typeof WORKSPACE_EVENT_TOPICS[number]
export type WorkspaceEventCommand = z.infer<typeof workspaceEventCommand>
export type WorkspaceEventMessage = z.infer<typeof workspaceEventMessage>
