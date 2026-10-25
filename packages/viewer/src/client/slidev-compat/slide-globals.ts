import type { ComponentType } from 'react'
/** Kept as an identity wrapper for component modules using the public loader API. */
export function withSlideGlobals<T extends ComponentType<any>>(component: T): T { return component }
