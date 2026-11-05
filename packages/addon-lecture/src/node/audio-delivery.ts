import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BufferSource, BufferTarget, Conversion, Input, Mp4OutputFormat, OGG, Output } from 'mediabunny'

/** A publication derivative: the same Opus packets with the seek metadata before the audio. */
export async function fastStartAudio(file: string, cache: string): Promise<{ bytes: Uint8Array, name: string, type: string } | undefined> {
  // BufferTarget holds one derivative in memory; long recordings keep their existing streaming path.
  if (!file.endsWith('.ogg') || statSync(file).size > 32 * 1024 * 1024) return undefined
  const source = readFileSync(file)
  const key = createHash('sha256').update('opus-mp4-fast-start-1\0').update(source).digest('hex')
  const cached = join(cache, `${key}.m4a`)
  let bytes: Uint8Array
  if (existsSync(cached)) bytes = readFileSync(cached)
  else {
    const input = new Input({ source: new BufferSource(source), formats: [OGG] })
    try {
      const tracks = await input.getAudioTracks()
      if (tracks.length !== 1 || tracks[0]!.codec !== 'opus') return undefined
      const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() })
      const conversion = await Conversion.init({ input, output, copy: { mode: 'forced' }, video: { discard: true } })
      if (!conversion.isValid || conversion.discardedTracks.length) return undefined
      await conversion.execute()
      bytes = new Uint8Array(output.target.buffer!)
    } catch {
      // Other Ogg layouts keep the original delivery; publishing does not require a new encoder.
      return undefined
    } finally { input.dispose() }
    mkdirSync(cache, { recursive: true })
    const temporary = `${cached}.${randomUUID()}`
    writeFileSync(temporary, bytes); renameSync(temporary, cached)
  }
  return { bytes, name: `${createHash('sha256').update(bytes).digest('hex').slice(0, 32)}.m4a`, type: 'audio/mp4; codecs="opus"' }
}
