import { createContext, useContext } from 'react'
import type { IRSection } from '@lincyaw/kernel'
export interface SectionContext { section: IRSection, step: number, view: string }
export const SECTION_CONTEXT = createContext<SectionContext | undefined>(undefined)
export function useSectionContext() { return useContext(SECTION_CONTEXT) }
