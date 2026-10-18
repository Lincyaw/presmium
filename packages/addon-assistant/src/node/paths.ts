import { isAbsolute, relative, resolve, sep } from 'node:path'

export function inside(path: string, dir: string): boolean {
  const rel = relative(resolve(dir), resolve(path))
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}
