import type { AnchorResolver } from '@lincyaw/kernel'
import { codeFingerprint, lineRange, resolvedAt, splitTarget, unresolved } from './anchors.ts'
import { findRegions } from './regions.ts'

function at(ref?: string): string {
  return ref ? ` at ${ref}` : ''
}

export const regionResolver: AnchorResolver = {
  scheme: 'region',
  async resolve(anchor, src, recorded, ref) {
    const target = splitTarget(anchor)
    if (!target) return { status: 'lost', message: `malformed anchor "${anchor}": expected region:<file>#<name>` }
    const text = await src.read(target.file, ref)
    if (text === undefined) return { status: 'lost', message: `${target.file} not found${at(ref)}` }
    const lines = text.split(/\r?\n/)
    const regions = findRegions(lines).map((r) => {
      const location = lineRange(target.file, lines, r.open + 2, r.close)
      return { name: r.name, location, fingerprint: codeFingerprint(location.text) }
    })
    const region = regions.find(r => r.name === target.name)
    if (region) return resolvedAt(region.location, recorded, region.fingerprint)
    return unresolved(`region "${target.name}" not found in ${target.file}${at(ref)}`, regions, recorded)
  },
}
