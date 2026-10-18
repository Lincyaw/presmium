import type { InjectionKey } from 'vue'
import type { HostAdapter } from './types.ts'

export const HOST: InjectionKey<HostAdapter> = Symbol('presmium.host')

export const installed: { adapter?: HostAdapter } = {}
