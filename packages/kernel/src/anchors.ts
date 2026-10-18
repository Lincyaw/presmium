import type { AnchorResolver, AnchorResolverRegistry, Resolution } from './contracts.ts'
import { errorMessage } from './errors.ts'

const SCHEME = /^[a-z][a-z0-9+.-]*$/i

export interface ParsedAnchor {
  scheme: string
  target: string
}

export function parseAnchor(anchor: string): ParsedAnchor | undefined {
  const colon = anchor.indexOf(':')
  const scheme = anchor.slice(0, colon)
  const target = anchor.slice(colon + 1)
  if (colon < 0 || !SCHEME.test(scheme) || target.trim() === '') return undefined
  return { scheme, target }
}

function lost(message: string): Resolution {
  return { status: 'lost', message }
}

export function createAnchorResolverRegistry(resolvers: AnchorResolver[] = []): AnchorResolverRegistry {
  const byScheme = new Map<string, AnchorResolver>()
  const registry: AnchorResolverRegistry = {
    register(resolver) {
      if (!SCHEME.test(resolver.scheme)) throw new Error(`invalid anchor scheme "${resolver.scheme}"`)
      if (byScheme.has(resolver.scheme)) throw new Error(`anchor scheme "${resolver.scheme}" is already registered`)
      byScheme.set(resolver.scheme, resolver)
      return () => {
        if (byScheme.get(resolver.scheme) === resolver) byScheme.delete(resolver.scheme)
      }
    },
    async resolve(anchor, src, recorded, ref) {
      const parsed = parseAnchor(anchor)
      if (!parsed) return lost(`malformed anchor "${anchor}": expected scheme:target`)
      const resolver = byScheme.get(parsed.scheme)
      if (!resolver) {
        const known = registry.schemes().join(', ') || 'none'
        return lost(`unknown anchor scheme "${parsed.scheme}" in "${anchor}" (registered schemes: ${known})`)
      }
      try {
        return await resolver.resolve(anchor, src, recorded, ref)
      } catch (error) {
        return lost(`resolver "${parsed.scheme}" failed on "${anchor}": ${errorMessage(error)}`)
      }
    },
    schemes() {
      return [...byScheme.keys()]
    },
  }
  for (const resolver of resolvers) registry.register(resolver)
  return registry
}
