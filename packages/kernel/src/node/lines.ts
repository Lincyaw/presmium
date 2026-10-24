import type { Readable } from 'node:stream'

// Terminal colours and cursor moves, which a log shown on a page does not draw.
const ESCAPES = /\x1B\[[0-?]*[ -/]*[@-~]|\x1B\][^\x07]*\x07/g

/** Calls `each` with every line `stream` writes (carriage returns end a line too), without terminal escapes. */
export function forEachLine(stream: Readable | null | undefined, each: (line: string) => void): void {
  if (!stream) return
  let rest = ''
  stream.setEncoding('utf8')
  stream.on('data', (chunk: string) => {
    const parts = (rest + chunk).split(/\r\n|\r|\n/)
    rest = parts.pop() ?? ''
    for (const part of parts) {
      const line = part.replace(ESCAPES, '')
      if (line.trim()) each(line)
    }
  })
  stream.on('end', () => {
    const line = rest.replace(ESCAPES, '')
    if (line.trim()) each(line)
    rest = ''
  })
}
