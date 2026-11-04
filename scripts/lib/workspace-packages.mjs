import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** The directories of the workspace's packages, relative to `root`, in the order pnpm-workspace.yaml lists them. */
export function workspaceDirs(root) {
  const globs = []
  for (const line of readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8').split('packages:\n')[1]?.split('\n') ?? []) {
    const listed = /^\s+-\s+['"]?([^'"\s]+)['"]?\s*$/.exec(line)
    if (!listed) break
    globs.push(listed[1])
  }
  return globs.flatMap(glob => (glob.endsWith('/*') ? readdirSync(join(root, glob.slice(0, -2))).sort().map(name => `${glob.slice(0, -2)}/${name}`) : [glob]))
    .filter(dir => existsSync(join(root, dir, 'package.json')))
}
