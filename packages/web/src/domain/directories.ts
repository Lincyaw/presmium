// The site's documents as the folders of the workspace hold them (`site.sidebar: directories`), for the sidebar and the
// order the pager follows. A document whose folder holds other documents is their parent; a folder that is no document
// still groups what is in it, under its name.

export interface DirectoryEntry {
  dir: string
}

export interface DirectoryNode<T extends DirectoryEntry> {
  /** The folder's own name, the last part of `dir`. */
  name: string
  dir: string
  /** The document in this folder, if there is one. */
  doc?: T
  children: DirectoryNode<T>[]
}

export interface SidebarSettings {
  by: 'tags' | 'directories'
  /**
   * Folders that come first among their siblings, in this order: a path (`rcabench/injector`) names one folder, a bare
   * name (`idea`) every folder of that name. The others follow by name.
   */
  order: string[]
}

/** `site.sidebar`: `directories`, or `{ by: directories, order: [...] }`; anything else groups by tags. */
export function sidebarSettings(value: unknown): SidebarSettings {
  const record = typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : { by: value }
  const order = Array.isArray(record.order) ? record.order.flatMap(item => (typeof item === 'string' && item.trim() ? [item.trim().replace(/^\/+|\/+$/g, '')] : [])) : []
  return { by: record.by === 'directories' ? 'directories' : 'tags', order }
}

const compareNames = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

/**
 * The tree of the entries' folders. With `order`, siblings are sorted (see `SidebarSettings.order`); without it they stay
 * in the order the entries first reach them, so entries already in tree order (`treeOrder`) keep it.
 */
export function directoryTree<T extends DirectoryEntry>(entries: readonly T[], order?: readonly string[]): DirectoryNode<T>[] {
  const root: DirectoryNode<T> = { name: '', dir: '', children: [] }
  const nodes = new Map<string, DirectoryNode<T>>([['', root]])
  const node = (dir: string): DirectoryNode<T> => {
    const known = nodes.get(dir)
    if (known) return known
    const at = dir.lastIndexOf('/')
    const created: DirectoryNode<T> = { name: dir.slice(at + 1), dir, children: [] }
    node(at < 0 ? '' : dir.slice(0, at)).children.push(created)
    nodes.set(dir, created)
    return created
  }
  for (const entry of entries) if (entry.dir) node(entry.dir).doc = entry
  if (order) {
    const rank = (n: DirectoryNode<T>) => {
      const path = order.indexOf(n.dir)
      if (path >= 0) return path
      const name = order.findIndex(item => !item.includes('/') && item === n.name)
      return name >= 0 ? name : order.length
    }
    const sort = (parent: DirectoryNode<T>) => {
      parent.children.sort((a, b) => rank(a) - rank(b) || compareNames(a.name, b.name))
      parent.children.forEach(sort)
    }
    sort(root)
  }
  return root.children
}

/** The entries in the order of their tree read top to bottom: a folder's document before what the folder holds. */
export function treeOrder<T extends DirectoryEntry>(entries: readonly T[], order: readonly string[] = []): T[] {
  const out: T[] = []
  const visit = (nodes: DirectoryNode<T>[]) => nodes.forEach((n) => {
    if (n.doc) out.push(n.doc)
    visit(n.children)
  })
  visit(directoryTree(entries, order))
  return out
}

/** A folder's name as a label: `spear-families` reads "Spear families". */
export function folderLabel(name: string): string {
  const words = name.replace(/[-_]+/g, ' ').trim()
  return words.charAt(0).toLocaleUpperCase() + words.slice(1)
}
