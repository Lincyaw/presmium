import { prefixedLogger } from '@lincyaw/kernel'
import type { Logger } from '@lincyaw/kernel'

const STDERR: Logger = {
  debug: (...args) => {
    if (process.env.PRESMIUM_DEBUG) console.error(...args)
  },
  info: (...args) => console.error(...args),
  warn: (...args) => console.error(...args),
  error: (...args) => console.error(...args),
}

/** A plugin's logger in Node: everything on stderr, debug only with PRESMIUM_DEBUG, tagged with the plugin's ID. */
export function pluginLogger(id: string): Logger {
  return prefixedLogger(STDERR, id)
}
