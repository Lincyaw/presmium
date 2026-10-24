/**
 * The modules of the document's own bundle that stand for plugins' document modules (`PresmiumNodePlugin.documentModules`):
 * the viewer app is built once for all documents, so a plugin's import of such a module gets a proxy here, which reads
 * the default export the current document's bundle gave.
 */

const current = new Map<string, unknown>()

export function setDocumentModules(modules: Record<string, unknown>): void {
  current.clear()
  for (const [id, value] of Object.entries(modules)) current.set(id, value)
}

const target = (id: string): object => {
  const value = current.get(id)
  return value !== null && typeof value === 'object' ? value : {}
}

/** The default export of document module `id`, as the current document gives it (an object: its keys are read when used). */
export function documentModule(id: string): unknown {
  return new Proxy({}, {
    get: (_, key) => Reflect.get(target(id), key),
    has: (_, key) => Reflect.has(target(id), key),
    ownKeys: () => Reflect.ownKeys(target(id)),
    getOwnPropertyDescriptor: (_, key) => {
      const descriptor = Reflect.getOwnPropertyDescriptor(target(id), key)
      return descriptor && { ...descriptor, configurable: true }
    },
  })
}
