import { useViewRole } from '@lincyaw/host'
import { createContext, useContext } from 'react'
export type StageProbe = () => boolean
export const STAGE_PROBE = createContext<StageProbe | undefined>(undefined)
export function useIsOnStage(): boolean { const probe = useContext(STAGE_PROBE); const role = useViewRole(); return probe ? probe() : role === 'audience' }
