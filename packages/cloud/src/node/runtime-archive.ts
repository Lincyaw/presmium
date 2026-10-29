import { CloudError } from '../domain/errors.ts'

export function runtimePath(path: string): string {
  if (typeof path !== 'string' || !path || path.length > 240 || path.startsWith('/') || /[\\\0\r\n]/.test(path)
    || path.split('/').some(part => !part || part === '.' || part === '..' || part === '.git')) throw new CloudError(400, 'runtime-file-path-invalid')
  return path
}

/** The broker emits only regular files in a bounded POSIX ustar archive. */
export function runtimeArchive(files: Array<{ path: string, bytes: Buffer }>, maxBytes: number): Buffer {
  const chunks: Buffer[] = []
  let size = 1024
  const seen = new Set<string>()
  for (const file of files) {
    const path = runtimePath(file.path)
    if (seen.has(path)) throw new CloudError(400, 'runtime-file-duplicate')
    seen.add(path)
    size += 512 + Math.ceil(file.bytes.length / 512) * 512
    if (size > maxBytes) throw new CloudError(413, 'runtime-input-limit')
    const header = Buffer.alloc(512)
    const encoded = Buffer.from(path)
    if (encoded.length > 100) {
      const at = path.lastIndexOf('/')
      if (at < 0 || Buffer.byteLength(path.slice(0, at)) > 155 || Buffer.byteLength(path.slice(at + 1)) > 100) throw new CloudError(400, 'runtime-file-path-invalid')
      header.write(path.slice(at + 1), 0, 100)
      header.write(path.slice(0, at), 345, 155)
    } else header.write(path, 0, 100)
    header.write('0000644\0', 100, 8)
    header.write('0001750\0', 108, 8) // uid 1000
    header.write('0001750\0', 116, 8)
    header.write(file.bytes.length.toString(8).padStart(11, '0') + '\0', 124, 12)
    header.write('00000000000\0', 136, 12)
    header.fill(32, 148, 156)
    header[156] = 48
    header.write('ustar\0', 257, 6)
    header.write('00', 263, 2)
    header.write([...header].reduce((sum, value) => sum + value, 0).toString(8).padStart(6, '0') + '\0 ', 148, 8)
    chunks.push(header, file.bytes, Buffer.alloc((512 - file.bytes.length % 512) % 512))
  }
  chunks.push(Buffer.alloc(1024))
  return Buffer.concat(chunks)
}

/** Do not extract a tenant-generated archive to the broker's filesystem. */
export function readRuntimeArchive(archive: Buffer, maxBytes: number): Array<{ path: string, bytes: Buffer }> {
  if (archive.length > maxBytes) throw new CloudError(413, 'runtime-output-limit')
  const result: Array<{ path: string, bytes: Buffer }> = []
  const seen = new Set<string>()
  const stringAt = (block: Buffer, at: number, length: number) => block.subarray(at, at + length).toString('utf8').replace(/\0.*$/s, '')
  let offset = 0
  let outputBytes = 0
  let nextPath: string | undefined
  const paxPath = (bytes: Buffer): string | undefined => {
    if (bytes.length > 65_536) throw new CloudError(422, 'runtime-output-archive-invalid')
    let at = 0, path: string | undefined
    while (at < bytes.length) {
      const space = bytes.indexOf(32, at), length = Number(bytes.subarray(at, space).toString('ascii'))
      if (space < at || !Number.isSafeInteger(length) || length < space - at + 3 || at + length > bytes.length || bytes[at + length - 1] !== 10) throw new CloudError(422, 'runtime-output-archive-invalid')
      const field = bytes.subarray(space + 1, at + length - 1).toString('utf8'), equals = field.indexOf('=')
      if (equals < 1) throw new CloudError(422, 'runtime-output-archive-invalid')
      if (field.slice(0, equals) === 'path') path = field.slice(equals + 1)
      if (['size', 'linkpath'].includes(field.slice(0, equals))) throw new CloudError(422, 'runtime-output-archive-invalid')
      at += length
    }
    return path
  }
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512)
    if (header.every(value => value === 0)) break
    const checksum = parseInt(stringAt(header, 148, 8).trim(), 8)
    const actual = [...header].reduce((sum, value, index) => sum + (index >= 148 && index < 156 ? 32 : value), 0)
    const size = parseInt(stringAt(header, 124, 12).trim(), 8)
    if (checksum !== actual || !Number.isSafeInteger(size) || size < 0 || offset + 512 + size > archive.length) throw new CloudError(422, 'runtime-output-archive-invalid')
    const type = header[156]
    if (type === 120 || type === 76) {
      if (size > 65_536) throw new CloudError(422, 'runtime-output-archive-invalid')
      const data = archive.subarray(offset + 512, offset + 512 + size)
      nextPath = type === 120 ? paxPath(data) : data.toString('utf8').replace(/\0.*$/s, '')
      offset += 512 + Math.ceil(size / 512) * 512
      continue
    }
    const prefix = stringAt(header, 345, 155), name = stringAt(header, 0, 100)
    const raw = (nextPath ?? `${prefix ? `${prefix}/` : ''}${name}`).replace(/^\.\//, '').replace(/\/$/, '')
    nextPath = undefined
    if ((!raw || raw === '.') && type === 53) { offset += 512 + Math.ceil(size / 512) * 512; continue }
    const path = runtimePath(raw)
    if (type !== 48 && type !== 0 && type !== 53) throw new CloudError(422, 'runtime-output-file-kind-unsupported')
    if (type !== 53) {
      if (seen.has(path)) throw new CloudError(422, 'runtime-output-file-duplicate')
      seen.add(path)
      outputBytes += size
      if (outputBytes > maxBytes || result.length >= 10_000) throw new CloudError(413, 'runtime-output-limit')
      result.push({ path, bytes: archive.subarray(offset + 512, offset + 512 + size) })
    }
    offset += 512 + Math.ceil(size / 512) * 512
  }
  return result
}
