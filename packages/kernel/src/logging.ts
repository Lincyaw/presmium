/** Loggers shared by the kernel, the server and the hosts. */
import type { Logger } from './contracts.ts'

/** A logger that puts `[id]` before what it logs. */
export function prefixed(log: Logger, id: string): Logger {
  const tag = `[${id}]`
  return {
    debug: (...args) => log.debug(tag, ...args),
    info: (...args) => log.info(tag, ...args),
    warn: (...args) => log.warn(tag, ...args),
    error: (...args) => log.error(tag, ...args),
  }
}
