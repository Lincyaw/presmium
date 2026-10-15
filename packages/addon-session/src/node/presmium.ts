import type { PresmiumNodePlugin } from '@presmium/kernel'
import { SESSION_ID } from '../domain/index.ts'

/** The session works in the browser only: no directives, passes or checks. */
const plugin: PresmiumNodePlugin = { id: SESSION_ID }

export default plugin
