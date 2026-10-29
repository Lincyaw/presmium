#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

// The stylesheets held to the design tokens: their colours, sizes and durations come from
// `packages/design/src/tokens.css`. px is allowed only in a media query, which cannot read a custom property.
// Their motion moves and resizes through transform and fades through opacity: a transition or a keyframe of a property
// that lays the box out (its size, position, margins, padding, borders, type size) or of `all` is reported.
const SCOPE = ['examples/animations/libraries/components', 'examples/animations/bubble-sort/components', 'examples/animations/guide-steps/components', 'examples/animations/guide-production/components', 'templates/plugin/components', 'packages/addon-session/src/client', 'packages/addon-classroom/components', 'packages/addon-classroom/src/client', 'packages/addon-assistant/src/client', 'packages/addon-content/src/client/MarkmapView.css', 'packages/workbench/src', 'packages/dsh/src/client', 'packages/web/src/app', 'packages/design/src', 'packages/addon-motion/src/client', 'packages/viewer/src/client/views', 'packages/viewer/src/client/style.css', 'packages/addon-guide/components', 'packages/addon-lecture/src/client/PlayerPanel.css']

const root = new URL('..', import.meta.url).pathname
const RAW = [
  { pattern: /#[0-9a-f]{3,8}\b/gi, what: 'a colour' },
  { pattern: /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/gi, what: 'a colour' },
  { pattern: /(?<![\w-])\d*\.?\d+px\b/g, what: 'a size in px' },
  { pattern: /(?<![\w-])\d*\.?\d+m?s\b/g, what: 'a duration' },
]

const LAYOUT = /^(?:all|(?:min-|max-)?(?:width|height|inline-size|block-size)|top|right|bottom|left|inset(?:-.+)?|margin(?:-.+)?|padding(?:-.+)?|border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?(?:-width)?|gap|row-gap|column-gap|grid-template(?:-.+)?|flex(?:-basis|-grow|-shrink)?|font-size|line-height|letter-spacing)$/

function stylesheets(dir) {
  if (statSync(dir).isFile()) return dir.endsWith('.css') ? [dir] : []
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : stylesheets(path)
    return entry.name.endsWith('.css') && path !== join(root, 'packages/design/src/tokens.css') ? [path] : []
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
    if (/^transition(?:-property)?$/.test(declaration[1])) {
      for (const part of value.split(',')) {
        const property = part.trim().split(/\s+/)[0]
        if (LAYOUT.test(property)) problems.push(`${relative(root, file)}:${text.slice(0, start).split('\n').length}: ${declaration[1]} animates ${property}; move and resize with transform, fade with opacity`)
      }
    }
    for (const { pattern, what } of RAW) {
      for (const found of value.matchAll(pattern)) {
        if (what === 'a size in px' && /^0?\.?0*px$/.test(found[0])) continue
        const line = text.slice(0, start + found.index).split('\n').length
        problems.push(`${relative(root, file)}:${line}: ${declaration[1]} has ${what} (${found[0]}); use a token of packages/design/src/tokens.css, adding one there if none fits`)
      }
    }
  }
  // A keyframe's declarations: everything between `@keyframes name {` and its closing brace.
  for (const keyframes of text.matchAll(/@keyframes\s+[\w-]+\s*\{((?:[^{}]*\{[^{}]*\})*)[^{}]*\}/g)) {
    for (const declaration of keyframes[1].matchAll(/([\w-]+)\s*:/g)) {
      if (!LAYOUT.test(declaration[1])) continue
      const line = text.slice(0, keyframes.index + keyframes[0].indexOf(keyframes[1]) + declaration.index).split('\n').length
      problems.push(`${relative(root, file)}:${line}: @keyframes animates ${declaration[1]}; move and resize with transform, fade with opacity`)
    }
  }
}

if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log(`tokens ok: ${files.length} stylesheets in ${SCOPE.join(', ')}`)
