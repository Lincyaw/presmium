import type { Logger } from './contracts.ts'

export function prefixedLogger(log: Logger, id: string): Logger {
  const tag = `[${id}]`
  return {
    debug: (...args) => log.debug(tag, ...args),
    info: (...args) => log.info(tag, ...args),
    warn: (...args) => log.warn(tag, ...args),
    error: (...args) => log.error(tag, ...args),
  }
}
