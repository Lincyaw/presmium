import { useStepState, useViewRole } from '@lincyaw/host'
import { createContext, useContext } from 'react'
export const MEDIA_ACTIVE = createContext(true)
export function useMediaActive(): boolean { const active = useContext(MEDIA_ACTIVE), role = useViewRole(), state = useStepState({ from: 0 }); return active && (role === 'reader' || state.active) }
