#!/usr/bin/env node
// Enforces the layering rules of docs/architecture.md section 3 across all packages.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const IMPORT = /(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g

const rules = [
  { name: 'domain is pure TS', dirs: ['src/domain'], forbid: /^(vue|vitepress|@slidev\/|node:|@presmium\/host)/ },
  { name: 'kernel is framework-free', pkgs: ['kernel'], dirs: ['src'], forbid: /^(vue|vitepress|@slidev\/|node:)/ },
  { name: 'host is form-neutral', pkgs: ['host'], dirs: ['src'], forbid: /^(vitepress|@slidev\/)/ },
  { name: 'components use @presmium/host, not a framework host', dirs: ['components', 'src/client'], except: ['addon-core', 'web'], forbid: /^(vitepress|@slidev\/client)/ },
  { name: 'only web uses vitepress', dirs: ['.'], except: ['web'], forbid: /^vitepress/ },
  { name: 'no framework internals', dirs: ['.'], forbid: /^@slidev\/client\/(?!index)|^vitepress\/dist|^@slidev\/cli\/dist/ },
]

function files(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter(f => /\.(ts|vue|mts|mjs|js)$/.test(f) && !f.includes('node_modules'))
    .map(f => join(dir, f))
}

const violations = []
for (const pkg of readdirSync(join(root, 'packages'))) {
  for (const rule of rules) {
    if (rule.pkgs && !rule.pkgs.includes(pkg)) continue
    if (rule.except?.includes(pkg)) continue
    for (const dir of rule.dirs) {
      for (const file of files(join(root, 'packages', pkg, dir))) {
        for (const [, spec] of readFileSync(file, 'utf8').matchAll(IMPORT)) {
          if (rule.forbid.test(spec)) violations.push(`${relative(root, file)}: ${spec}  (${rule.name})`)
        }
      }
    }
  }
}

if (violations.length) {
  console.error(`layering violations:\n${[...new Set(violations)].join('\n')}`)
  process.exit(1)
}
console.log('layering ok')
