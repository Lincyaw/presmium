import type { InjectionKey } from 'vue'
import type { HostAdapter } from './contracts.ts'

export const HOST: InjectionKey<HostAdapter> = Symbol('presmium.host')

export const installed: { adapter?: HostAdapter } = {}
