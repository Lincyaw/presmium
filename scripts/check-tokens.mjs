#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

// The stylesheets held to the design tokens: their colours, sizes and durations come from
// `packages/design/src/tokens.css`. px is allowed only in a media query, which cannot read a custom property.
const SCOPE = ['packages/workbench/src', 'packages/dsh/src/client', 'packages/web/src/app']

const root = new URL('..', import.meta.url).pathname
const RAW = [
  { pattern: /#[0-9a-f]{3,8}\b/gi, what: 'a colour' },
  { pattern: /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/gi, what: 'a colour' },
  { pattern: /(?<![\w-])\d*\.?\d+px\b/g, what: 'a size in px' },
  { pattern: /(?<![\w-])\d*\.?\d+m?s\b/g, what: 'a duration' },
]

function stylesheets(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : stylesheets(path)
    return entry.name.endsWith('.css') ? [path] : []
  })
}

const problems = []
const files = SCOPE.flatMap(dir => stylesheets(join(root, dir)))
for (const file of files) {
  // Comments keep their length, so that offsets still give the line.
  const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, comment => comment.replace(/[^\n]/g, ' '))
  // A declaration's value: after `name:` up to `;` or `}`. Selectors and media queries are followed by `{` and do not match.
  for (const declaration of text.matchAll(/([\w-]+)\s*:\s*([^;{}]+)(?=[;}])/g)) {
    const value = declaration[2]
    const start = declaration.index + declaration[0].length - value.length
    for (const { pattern, what } of RAW) {
      for (const found of value.matchAll(pattern)) {
        if (what === 'a size in px' && /^0?\.?0*px$/.test(found[0])) continue
        const line = text.slice(0, start + found.index).split('\n').length
        problems.push(`${relative(root, file)}:${line}: ${declaration[1]} has ${what} (${found[0]}); use a token of packages/design/src/tokens.css, adding one there if none fits`)
      }
    }
  }
}

if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log(`tokens ok: ${files.length} stylesheets in ${SCOPE.join(', ')}`)
