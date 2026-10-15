import { createSharedStates } from '@presmium/host'
import { configs } from '@slidev/client'

/**
 * Shared states of the slides form (`useSharedState`), kept as in the web
 * form (`createSharedStates`, under the deck's title, so the 'remote' states
 * of both forms meet in a classroom): between the deck's windows over a
 * BroadcastChannel, and for the 'remote' scope through the sync transports
 * (./sync.ts adds each transport here too). Not Slidev sync channels
 * (`createSyncState`): those ignore a value from another device that arrives
 * right after a local change, and send a local change right after a remote
 * one as remote, so the transports drop it.
 */
export const sharedStates = createSharedStates(configs.title)
