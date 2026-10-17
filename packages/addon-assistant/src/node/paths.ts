/**
 * Where a path is, as the compiler's `inside` says it (F-11): a child named
 * `..notes.md` is inside its directory; only `..` and what is under it are
 * not. The review, the permissions and the change tasks decide by it.
 */
import { isAbsolute, relative, resolve, sep } from 'node:path'

/** Whether `path` is `dir` or lies under it. */
export function inside(path: string, dir: string): boolean {
  const rel = relative(resolve(dir), resolve(path))
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}
