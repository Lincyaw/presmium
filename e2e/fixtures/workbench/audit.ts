// The start audit's half that reads the pinned DeepSeek Harness (docs/design-dsh.md section 12, group 3; WP-96d): what the
// workbench's client part relies on (packages/dsh/src/client/contract.ts and theme.ts), checked against the client
// bundles of the installed version, found through @presmium/dsh (its DeepSeek Harness, then the web bundle's
// dependencies). Only the shipped bundles' text is read; nothing of DeepSeek Harness is imported.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DSH_PACKAGE = fileURLToPath(new URL('../../../packages/dsh/package.json', import.meta.url))
const dsh = createRequire(DSH_PACKAGE).resolve('@deepseek-ai/dsh/package.json')
const webApp = createRequire(dsh).resolve('@deepseek-ai/dsh-web-app/package.json')

/** A package of the web bundle's, by name: its directory. */
function packageDir(name: string): string {
  return dirname(createRequire(webApp).resolve(`${name}/package.json`))
}

/** The client bundle of a package of the web bundle's (its `./client` export); empty for a package without one. */
export function clientOf(name: string): string {
  const dir = packageDir(name)
  const { exports = {} } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { exports?: Record<string, string | { default?: string }> }
  const client = exports['./client']
  const file = typeof client === 'string' ? client : client?.default
  return file ? readFileSync(join(dir, file), 'utf8') : ''
}

/** The client packages the web bundle ships. */
export function clientPackages(): string[] {
  const { dependencies = {} } = JSON.parse(readFileSync(webApp, 'utf8')) as { dependencies?: Record<string, string> }
  return Object.keys(dependencies).filter(name => name.startsWith('@deepseek-ai/dsh-client-'))
}

/** The child slots ui-layout's registration of `root` declares, with their kinds and scopes. */
export function rootChildren(): Record<string, { kind: string, scope: string }> {
  const text = clientOf('@deepseek-ai/dsh-client-ui-layout')
  const at = text.indexOf('name: "root"')
  const region = text.slice(at, text.indexOf('}, AppFrame)', at))
  return Object.fromEntries([...region.matchAll(/"([\w.]+)": \{\s*kind: "(\w+)",\s*scope: "(\w+)"/g)].map(([, name, kind, scope]) => [name!, { kind: kind!, scope: scope! }]))
}

/** The members of `ctx.layout` the other client plugins use. */
export function layoutMembersUsed(): string[] {
  const used = new Set<string>()
  for (const name of clientPackages()) {
    if (name === '@deepseek-ai/dsh-client-ui-layout') continue
    const text = clientOf(name)
    for (const [, member] of text.matchAll(/\bctx\.layout\.(\w+)/g)) used.add(member!)
    // `const layout = ctx.layout;`, then `layout.openRightbar(...)` and `layout.panelInfo` (the name is also a dock layout's).
    for (const [, alias] of text.matchAll(/\b(?:const|let) (\w+) = ctx\.layout;/g)) {
      for (const [, called, read] of text.matchAll(new RegExp(`\\b${alias}\\.(\\w+)\\(|\\b${alias}\\.(panelInfo)\\b`, 'g'))) used.add((called ?? read)!)
    }
  }
  return [...used].sort()
}

/** Whether some client bundle renders the slot `name`. */
export function rendersSlot(name: string): boolean {
  return clientPackages().some(pkg => clientOf(pkg).includes(`renderSlot("${name}"`))
}

/** The `--dsw-alias-*` tokens ui-theme defines, and those the client bundles use. */
export function aliasTokens(): { defined: Set<string>, used: Set<string> } {
  const defined = new Set([...clientOf('@deepseek-ai/dsh-client-ui-theme').matchAll(/(--dsw-alias-[a-z0-9-]+)\s*:/g)].map(([, name]) => name!))
  const used = new Set<string>()
  for (const name of clientPackages()) for (const [, token] of clientOf(name).matchAll(/var\((--dsw-alias-[a-z0-9-]+)/g)) used.add(token!)
  return { defined, used }
}

/** The keys of the web shell's module table (the frontend's `PLATFORM_MODULES`). */
export function shellModules(): string[] {
  const dist = join(packageDir('@deepseek-ai/dsh-web-frontend'), 'dist/index.html')
  const script = /src="\.\/(assets\/index-[\w-]+\.js)"/.exec(readFileSync(dist, 'utf8'))![1]!
  const text = readFileSync(join(dirname(dist), script), 'utf8')
  const table = /return\{(react:[^}]*)\}\}/.exec(text)![1]!
  return [...table.matchAll(/(?:^|,)"?([@\w/.-]+)"?:/g)].map(([, key]) => key!).sort()
}
