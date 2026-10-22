import { isAbsolute, relative, sep } from 'node:path'

/** Whether path is root itself or lies under it; symbolic links are not resolved. */
export function isInside(path: string, root: string): boolean {
  const rel = relative(root, path)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}
