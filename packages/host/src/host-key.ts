import { createContext } from 'react'
import type { HostAdapter } from './contracts.ts'
export const HOST = createContext<HostAdapter | undefined>(undefined)
export const installed: { adapter?: HostAdapter } = {}
