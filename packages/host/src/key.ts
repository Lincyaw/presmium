import type { InjectionKey } from 'vue'
import type { HostAdapter } from './types.ts'

/** The installed host adapter (`installHost`). */
export const HOST: InjectionKey<HostAdapter> = Symbol('presmium.host')

/** The adapter installed last, for what runs outside components (`useSharedState`, `currentLocale`). */
export const installed: { adapter?: HostAdapter } = {}
