#!/usr/bin/env node
// Interface text in zh-CN and en (docs/architecture.md 5.7, docs/glossary.md).
//
// Report-only by default: it prints every finding and exits 0, because the packages are being brought to the glossary
// one slice at a time. `--strict` exits 1 when a message catalog has a finding (A–C below); turn it on, and add the
// script to `pnpm test`, once the catalogs are clean. The source scan (D–F) stays a report: a literal it lists may be
// a key, a CSS class or a log line, which only a reader can tell.
//
//   A  a key present in one locale only
//   B  untranslated text: CJK in en, an English sentence in zh-CN, or the same wording in both
//   C  a style rule of docs/glossary.md broken, or a term the glossary lists as not to be used
//   D  user-visible text written outside a catalog: JSX text, aria-label/title/placeholder/alt literals, CJK literals
//   E  CLI output and thrown errors written as literals (for a reader to judge whether they reach authors)
//   F  places that choose the interface language themselves instead of through @lincyaw/host (or, in the studio, the
//      workbench state)
//
// Usage: node scripts/check-i18n.mjs [--strict] [--package <name>] [--summary] [--json]
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { createRequire, register } from 'node:module'
import { join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = new URL('..', import.meta.url).pathname
const args = process.argv.slice(2)
const strict = args.includes('--strict')
const summaryOnly = args.includes('--summary')
const asJson = args.includes('--json')
const only = args.includes('--package') ? args[args.indexOf('--package') + 1] : undefined

// Catalog modules import stylesheets and assets through @lincyaw/host; loading one for its text needs none of them.
register('data:text/javascript,' + encodeURIComponent(`
export async function load(url, context, next) {
  if (/\\.(css|svg|png|jpe?g|webp|woff2?|wasm)(\\?.*)?$/.test(url)) return { format: 'module', source: 'export default ""', shortCircuit: true }
  return next(url, context)
}`))

const SCOPE = ['workbench', 'dsh', 'design', 'studio', 'host', 'viewer', 'web', 'mcp', 'cli', 'presmium', 'create-presmium', 'vscode',
  ...readdirSync(join(root, 'packages')).filter(name => name.startsWith('addon-')).sort()]
const CLI_PACKAGES = new Set(['cli', 'studio', 'presmium', 'create-presmium'])
const CJK = /[㐀-鿿豈-﫿]/
const CJK_ANY = /[　-〿㐀-鿿豈-﫿＀-￯]/
// Names that are the same in both languages (brands, formats, standards).
const SAME = /^(?:Presmium(?: Studio)?|Notebook|PowerPoint|PDF|PNG|SVG|AI|LaTeX|PlantUML|Markdown|Python|Jupyter(?:Lab)?|WebGPU|WASI|Git|GitHub|Mermaid|Markmap|JSON|HTML|URL|ID|OK|Ctrl\+[A-Z]|Esc|Tab|Enter|Shift|Alt|Ctrl\s?[A-Z]|https?:\/\/\S+|[a-z0-9]+(?:-[a-z0-9]+)+|[hms:.]+|\W*|[\d\s\W]+)$/

const findings = []
const add = (pkg, kind, where, text, note = '') => findings.push({ pkg, kind, where, text: String(text).replace(/\s+/g, ' ').slice(0, 160), note })

// --- the glossary's do-not-use terms ---------------------------------------------------------------------------------
// Every table row of docs/glossary.md whose last column holds `backticked` terms: a CJK term is checked in zh-CN text,
// any other in the text of both locales (as a whole word, ignoring case).
const banned = { zh: [], en: [] }
const glossaryFile = join(root, 'docs/glossary.md')
if (existsSync(glossaryFile)) {
  for (const line of readFileSync(glossaryFile, 'utf8').split('\n')) {
    if (!line.startsWith('|') || /^\|\s*-/.test(line)) continue
    const cells = line.split('|').slice(1, -1).map(cell => cell.trim())
    if (cells.length < 4) continue
    const preferred = cells[0].startsWith('（') ? 'nothing (not shown to authors)' : `${cells[0]} / ${cells[1]}`.replace(/`/g, '')
    for (const [, term] of cells.at(-1).matchAll(/`([^`]+)`/g)) {
      if (CJK.test(term)) { if (!banned.zh.some(known => known.term === term)) banned.zh.push({ term, preferred }) }
      else if (!banned.en.some(known => known.term.toLowerCase() === term.toLowerCase())) banned.en.push({ term, preferred, pattern: new RegExp(`(?<![\\w-])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`, 'i') })
    }
  }
}

// --- style rules -----------------------------------------------------------------------------------------------------
const ZH_RULES = [
  [/[㐀-鿿][,;:!?]|[,;!?]\s*[㐀-鿿]|[㐀-鿿]\(|\)[㐀-鿿]/, '中文用全角标点（，；：！？（））'],
  [/\.\.\.|……|。。/, '省略号用单个“…”'],
  [/[!！]/, '不用感叹号'],
  [/[㐀-鿿][A-Za-z0-9]|[A-Za-z0-9][㐀-鿿]/, '中文与拉丁字母、数字之间加一个半角空格'],
  [/[「」『』]|"/, '中文引号用“”，嵌套用‘’'],
  [/(?:吧|呢|啦|哦|呀|哈|嘛)[。，？]?$|(?:吧|呢|啦|哦|呀|嘛)[，。？]|您|咱|搞定|没能|弄|点一下/, '口语、语气词或敬称'],
]
const EN_RULES = [
  [CJK_ANY, 'CJK characters in en text'],
  [/\.\.\./, 'ellipsis is one “…” character'],
  [/!(?!=)/, 'no exclamation marks'],
  [/(?<![=\w])"|(?<=\w)'(?=\w)|(?<=\s)'|'(?=\s|$)/, 'quotes are “ ” and apostrophes ’'],
  [/\b(?:colou?r(?<!color)|colours?|cancell(?:ed|ing)|centre|behaviour|organis|recognis|licence|dialogue|catalogue|favourite|grey)\b/i, 'US English spelling'],
  [/\b(?:oops|awesome|great job|hooray|whoops|uh-oh|gonna|wanna)\b/i, 'colloquial wording'],
]

// A short imperative phrase (a command name) with a lowercase word that Title Case capitalizes. Labels that are not
// commands (field labels, options) are sentence case, so this only looks at phrases opening with a command verb.
const VERBS = 'New|Open|Close|Save|Delete|Rename|Duplicate|Move|Insert|Export|Send|Fix|Rewrite|Discard|Recover|Restore|Undo|Redo|Show|Hide|Exit|End|Make|Add|Set|Get|Reload|Retry|Play|Download|Apply|Generate|Present|Copy|Paste|Cut|Search|Find|Share|Print|Post|Resolve|Reopen|Edit|Choose|Start|Stop|Create|Remove|Clear|Record|Replace|Import|Upload|Enable|Disable|Turn|Go|Jump|Skip|View|Review|Check|Browse|Run|Reset|Unify'
const MINOR = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'so', 'yet', 'at', 'by', 'from', 'in', 'into', 'of', 'off', 'on', 'onto', 'out', 'over', 'to', 'up', 'with', 'as', 'via'])
const commandInSentenceCase = text => new RegExp(`^(?:${VERBS})(?: [\\w’-]+){1,4}…?$`).test(text) && text.replace(/…$/, '').split(' ').slice(1).some(word => /^[a-z]/.test(word) && !MINOR.has(word))

// --- A–C: catalogs ---------------------------------------------------------------------------------------------------
function walk(path, value, into, sample) {
  if (typeof value === 'string') into.set(path, value)
  else if (typeof value === 'function') into.set(path, call(value, sample))
  else if (Array.isArray(value)) value.forEach((item, i) => walk(`${path}[${i}]`, item, into, sample))
  else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) walk(path ? `${path}.${key}` : key, item, into, sample)
}

// A message function is called with sample arguments: numbers first, then strings, then mixed.
function call(fn, sample) {
  const n = Math.max(fn.length, 1)
  for (const attempt of [Array(n).fill(2), Array(n).fill(sample), [2, ...Array(n - 1).fill(sample)], [sample, ...Array(n - 1).fill(2)], [[]], [[{ text: sample, section: sample, quote: sample }]]]) {
    try {
      const out = fn(...attempt)
      if (typeof out === 'string') return out
    } catch {}
  }
  return undefined
}

function sourceLine(file, key) {
  const last = key.split(/[.[\]]/).filter(Boolean).filter(part => !/^\d+$/.test(part)).at(-1)
  const lines = readFileSync(file, 'utf8').split('\n')
  const index = lines.findIndex(line => new RegExp(`(?:^|[\\s{,])['"]?${last.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')}['"]?\\s*[:(]`).test(line))
  return index < 0 ? '' : `:${index + 1}`
}

function checkText(pkg, where, text, locale) {
  if (locale === 'zh-CN') {
    for (const [pattern, rule] of ZH_RULES) if (pattern.test(text)) add(pkg, 'C', where, text, rule)
    for (const { term, preferred } of banned.zh) if (text.includes(term)) add(pkg, 'C', where, text, `术语：不用“${term}”，用 ${preferred}`)
    for (const { term, preferred, pattern } of banned.en) if (pattern.test(text)) add(pkg, 'C', where, text, `术语：不用“${term}”，用 ${preferred}`)
  } else {
    for (const [pattern, rule] of EN_RULES) if (pattern.test(text)) add(pkg, rule.startsWith('CJK') ? 'B' : 'C', where, text, rule)
    if (commandInSentenceCase(text)) add(pkg, 'C', where, text, 'command not in Title Case (glossary 3)')
    for (const { term, preferred, pattern } of banned.en) if (pattern.test(text)) add(pkg, 'C', where, text, `term: not “${term}”, use ${preferred}`)
  }
}

function packageOf(file) {
  return relative(join(root, 'packages'), file).split(sep)[0]
}

function sources(dir, test = name => /\.(?:tsx?|mjs|js)$/.test(name) && !name.endsWith('.d.ts')) {
  if (!existsSync(dir)) return []
  if (statSync(dir).isFile()) return test(dir) ? [dir] : []
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return ['node_modules', 'test', 'dist', 'vendor', '.presmium', 'fixtures'].includes(entry.name) ? [] : sources(path, test)
    return test(entry.name) ? [path] : []
  })
}

const packages = only ? [only] : SCOPE
let catalogs = 0
const lineAt = (text, index) => text.slice(0, index).split('\n').length

// A catalog written inside a component module (.tsx) is not exported or cannot be imported without JSX: each object
// literal that holds a 'zh-CN' key is cut out of the source, transpiled with TypeScript and evaluated on its own.
const ts = (await import(pathToFileURL(join(root, 'node_modules/typescript/lib/typescript.js')).href)).default
function inlineCatalogs(text) {
  const found = []
  const stack = []
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '/' && text[i + 1] === '/') { i = text.indexOf('\n', i); if (i < 0) break; continue }
    if (c === '/' && text[i + 1] === '*') { i = text.indexOf('*/', i) + 1; continue }
    if (c === '\'' || c === '"') {
      const end = skipString(text, i, c)
      if (/^['"]zh-CN['"]\s*:/.test(text.slice(i, end + 8)) && /[{,]\s*$/.test(text.slice(Math.max(0, i - 200), i)) && stack.length && !found.some(f => f.start === stack.at(-1))) found.push({ start: stack.at(-1) })
      i = end
      continue
    }
    if (c === '`') { i = skipTemplate(text, i); continue }
    if (c === '{') stack.push(i)
    else if (c === '}') {
      const start = stack.pop()
      const entry = found.find(f => f.start === start)
      if (entry) entry.end = i + 1
    }
  }
  return found.filter(f => f.end).map(f => ({ line: lineAt(text, f.start), source: text.slice(f.start, f.end) }))
}
function skipString(text, i, quote) {
  for (let j = i + 1; j < text.length; j++) {
    if (text[j] === '\\') j++
    else if (text[j] === quote || text[j] === '\n') return j
  }
  return text.length
}
function skipTemplate(text, i) {
  for (let j = i + 1; j < text.length; j++) {
    if (text[j] === '\\') j++
    else if (text[j] === '`') return j
    else if (text[j] === '$' && text[j + 1] === '{') {
      let depth = 1
      for (j += 2; j < text.length && depth; j++) {
        if (text[j] === '{') depth++
        else if (text[j] === '}') depth--
        else if (text[j] === '`') j = skipTemplate(text, j)
        else if (text[j] === '\'' || text[j] === '"') j = skipString(text, j, text[j])
      }
      j--
    }
  }
  return text.length
}
// The end of the object literal opening at `start`, skipping strings, templates and comments.
function closing(text, start) {
  let depth = 0
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (c === '/' && text[i + 1] === '/') i = text.indexOf('\n', i)
    else if (c === '/' && text[i + 1] === '*') i = text.indexOf('*/', i) + 1
    else if (c === '\'' || c === '"') i = skipString(text, i, c)
    else if (c === '`') i = skipTemplate(text, i)
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) return i + 1
    if (i < 0) break
  }
  return text.length
}
// Catalog text blanked out of a source, so that the scan for hard-coded text sees only the rest of the module.
function withoutCatalogs(text) {
  const ranges = inlineCatalogs(text).map(c => [text.indexOf(c.source), text.indexOf(c.source) + c.source.length])
  for (const match of text.matchAll(/\b(?:const|let)\s+(?:zh|zhCN|zh_CN|en|en_US|enUS)\b[^=\n]*=\s*\{/g)) ranges.push([match.index, closing(text, match.index + match[0].length - 1)])
  let out = text
  for (const [from, to] of ranges) out = out.slice(0, from) + out.slice(from, to).replace(/[^\n]/g, ' ') + out.slice(to)
  return out
}
async function evaluate(source) {
  const js = ts.transpileModule(`export default (${source})`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.Preserve } }).outputText
  return (await import('data:text/javascript,' + encodeURIComponent(js))).default
}
for (const pkg of packages) {
  for (const file of sources(join(root, 'packages', pkg))) {
    const text = readFileSync(file, 'utf8')
    if (!/messages\.ts$/.test(file) && !/['"]zh-CN['"]\s*:/.test(text)) continue
    // Self-contained literals are evaluated from the source; a module whose catalog refers to other bindings
    // (`{ 'zh-CN': zh, en }`) is imported for its exports instead.
    const entries = []
    let unresolved = !/messages\.ts$/.test(file) ? 0 : 1
    for (const literal of inlineCatalogs(text)) {
      try {
        entries.push([undefined, await evaluate(literal.source), literal.line])
      } catch {
        unresolved++
      }
    }
    if (unresolved && file.endsWith('.tsx')) add(pkg, 'A', relative(root, file), '', 'inline catalog refers to other bindings and could not be evaluated')
    else if (unresolved) {
      try {
        entries.push(...Object.entries(await import(pathToFileURL(file).href)))
      } catch (error) {
        add(pkg, 'A', relative(root, file), error.message.split('\n')[0], 'catalog could not be loaded')
      }
    }
    const seen = new Set()
    for (const [name, value, line] of entries) {
      if (!value || typeof value !== 'object' || !('zh-CN' in value)) continue
      const enKey = 'en' in value ? 'en' : 'en-US' in value ? 'en-US' : undefined
      const where = relative(root, file)
      const zh = new Map()
      const en = new Map()
      walk('', value['zh-CN'], zh, '标题')
      if (enKey) walk('', value[enKey], en, 'Title')
      const identity = JSON.stringify([...zh, ...en])
      if (seen.has(identity)) continue
      seen.add(identity)
      catalogs++
      const loc = key => line ? `${where}:${line}${key ? ` ${key}` : ''}` : `${where}${sourceLine(file, key)} ${name}.${key}`
      if (!enKey) add(pkg, 'A', loc(''), '', 'no en catalog')
      for (const key of zh.keys()) if (enKey && !en.has(key)) add(pkg, 'A', loc(key), zh.get(key) ?? '', 'missing in en')
      for (const key of en.keys()) if (!zh.has(key)) add(pkg, 'A', loc(key), en.get(key) ?? '', 'missing in zh-CN')
      for (const [key, text] of zh) {
        if (text === undefined) continue
        const at = loc(key)
        if (!CJK.test(text) && /[A-Za-z]{2,}[\s,][A-Za-z]{2,}/.test(text) && !SAME.test(text.trim())) add(pkg, 'B', at, text, 'English text in zh-CN')
        else if (en.get(key) === text && /[A-Za-z㐀-鿿]/.test(text) && !SAME.test(text.trim())) add(pkg, 'B', at, text, 'same text in zh-CN and en')
        checkText(pkg, at, text, 'zh-CN')
      }
      for (const [key, text] of en) if (text !== undefined) checkText(pkg, loc(key), text, 'en')
    }
  }
}

// The block editor's own text (BlockNote's dictionaries) shows in the workbench beside Presmium's; the workbench passes
// it through `dictionary`, where any term that breaks the glossary is to be overridden.
if (!only || only === 'workbench') {
  let blocknote
  try {
    blocknote = createRequire(join(root, 'packages/workbench/package.json'))('@blocknote/core/locales')
  } catch {}
  if (blocknote) {
    const zh = new Map()
    const en = new Map()
    walk('', blocknote.zh, zh, '标题')
    walk('', blocknote.en, en, 'Title')
    catalogs++
    for (const [key, text] of zh) if (text) checkText('workbench', `packages/workbench/src/document-editor/BlockNoteSurface.tsx:126 BlockNote zh.${key}`, text, 'zh-CN')
    for (const [key, text] of en) if (text) checkText('workbench', `packages/workbench/src/document-editor/BlockNoteSurface.tsx:126 BlockNote en.${key}`, text, 'en')
  }
}

// --- D–F: source -----------------------------------------------------------------------------------------------------
// Comments are blanked (keeping line breaks) so that offsets still give the line; a `//` after `:` is a URL.
const uncomment = text => text
  .replace(/\/\*[\s\S]*?\*\//g, comment => comment.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (all, before) => before + ' '.repeat(all.length - before.length))
const VISIBLE_ATTRIBUTE = /\b(aria-label|aria-description|aria-valuetext|aria-roledescription|title|placeholder|alt|label)\s*=\s*(["'])([^"'\n]*[A-Za-z㐀-鿿][^"'\n]*)\2/g
const DOM_TEXT = /(?:\.(?:textContent|innerText|title|placeholder|ariaLabel|alt)\s*=\s*|setAttribute\(\s*['"](?:aria-label|title|placeholder|alt)['"]\s*,\s*)(['"`])((?:(?!\1)[^\n])*[A-Za-z㐀-鿿](?:(?!\1)[^\n])*)\1/g
// JSX text: between a tag's `>` and the next `<`, on one line, holding a word and no code punctuation.
const JSX_TEXT = /(?<=<\/?[A-Za-z][\w.]*(?:\s[^<>]*?)?>|\/>)([^<>{}\n]*[A-Za-z㐀-鿿][^<>{}\n]*?)(?=<)/g
// An object property that names text for a person (a label, title, hint or message) written as an English phrase.
const PROPERTY_TEXT = /\b(label|title|placeholder|description|tooltip|ariaLabel|hint|summary|heading|caption)\s*:\s*(['"`])([A-Z][a-z]+(?:[ ,'’][^'"`\n]*)?)\2/g
const CJK_LITERAL = /(['"`])((?:(?!\1)[^\n\\]|\\.)*[㐀-鿿](?:(?!\1)[^\n\\]|\\.)*)\1/g
const CLI_OUTPUT = /(?:console\.(?:log|error|warn|info)|process\.(?:stdout|stderr)\.write|\b(?:log|say|print|fail|warn)\()\s*\(?\s*(['"`])((?:(?!\1)[^\n\\]|\\.)*[A-Za-z]{3,}(?:(?!\1)[^\n\\]|\\.)*)\1/g
const THROWN = /new (?:Error|TypeError|RangeError)\(\s*(['"`])((?:(?!\1)[^\n\\]|\\.){12,})\1/g
const LOCALE_CHOICE = [
  /navigator\.languages?\b/, /documentElement\.lang\b/, /\.startsWith\(\s*['"]zh/, /\/\^zh\//, /process\.env\.(?:LANG|LC_ALL|LC_MESSAGES|LANGUAGE)\b/,
  /resolvedOptions\(\)\.locale/, /attributeFilter:\s*\[\s*['"]lang['"]/, /\bfunction localeOf\b|\bconst localeOf\b/,
]
const LOCALE_OWNERS = new Set(['packages/host/src/locale.ts'])

for (const pkg of packages) {
  for (const file of sources(join(root, 'packages', pkg))) {
    const where = relative(root, file)
    const isCatalog = /messages\.ts$/.test(file)
    const text = uncomment(readFileSync(file, 'utf8'))
    const rest = /['"]zh-CN['"]\s*:/.test(text) ? withoutCatalogs(text) : text
    if (!isCatalog) {
      if (file.endsWith('.tsx')) {
        for (const match of rest.matchAll(VISIBLE_ATTRIBUTE)) add(pkg, 'D', `${where}:${lineAt(rest, match.index)}`, `${match[1]}="${match[3]}"`, 'attribute literal')
        for (const match of rest.matchAll(JSX_TEXT)) {
          const value = match[1].trim()
          if (!value || /[=;&|]|=>|^\w+\s*[<>]|^[,:()?]|\w:\s*\w|[:?]$/.test(value) || /^[\w.]+$/.test(value) && !CJK.test(value) && value.length < 3) continue
          add(pkg, 'D', `${where}:${lineAt(rest, match.index)}`, value, 'JSX text')
        }
      }
      for (const match of rest.matchAll(DOM_TEXT)) add(pkg, 'D', `${where}:${lineAt(rest, match.index)}`, match[2], 'DOM text literal')
      // Tool descriptions (MCP and the plugins' tools) are read by the AI, not shown to authors.
      const forTools = /inputSchema|registerTool|defineTool/.test(rest) || /packages\/mcp\/|tools?\.ts$/.test(where)
      for (const match of rest.matchAll(PROPERTY_TEXT)) if (!(forTools && match[1] === 'description') && (/\s/.test(match[3]) || match[3].length > 3)) add(pkg, 'D', `${where}:${lineAt(rest, match.index)}`, `${match[1]}: ${match[3]}`, 'English property literal outside a catalog')
      for (const match of rest.matchAll(CJK_LITERAL)) add(pkg, 'D', `${where}:${lineAt(rest, match.index)}`, match[2], 'CJK literal outside a catalog')
      if (CLI_PACKAGES.has(pkg)) for (const match of rest.matchAll(CLI_OUTPUT)) add(pkg, 'E', `${where}:${lineAt(rest, match.index)}`, match[2], 'CLI output literal')
      for (const match of rest.matchAll(THROWN)) if (/[A-Za-z]{3,}\s+[A-Za-z]{3,}|[㐀-鿿]/.test(match[2])) add(pkg, 'E', `${where}:${lineAt(rest, match.index)}`, match[2], 'thrown error literal')
    }
    if (!LOCALE_OWNERS.has(where)) {
      const lines = text.split('\n')
      lines.forEach((line, i) => {
        for (const pattern of LOCALE_CHOICE) if (pattern.test(line)) {
          add(pkg, 'F', `${where}:${i + 1}`, line.trim(), 'chooses the locale itself')
          break
        }
      })
    }
  }
  // Labels a dsh patch shows to authors (preset names and descriptions) have one language only.
  for (const patch of sources(join(root, 'packages', pkg), name => /\.patch\.yml$/.test(name))) {
    readFileSync(patch, 'utf8').split('\n').forEach((line, i) => {
      const match = /^\s*(name|description|label|title):\s*(.+)$/.exec(line)
      if (match && !match[2].startsWith("'@") && !/^[\w@/:.-]+$/.test(match[2].trim())) add(pkg, 'D', `${relative(root, patch)}:${i + 1}`, `${match[1]}: ${match[2]}`, 'patch label in one language')
    })
  }
  // VS Code: package.nls.json and its zh-cn counterpart hold the same keys.
  const nls = join(root, 'packages', pkg, 'package.nls.json')
  if (existsSync(nls)) {
    const base = JSON.parse(readFileSync(nls, 'utf8'))
    const zhFile = join(root, 'packages', pkg, 'package.nls.zh-cn.json')
    const zh = existsSync(zhFile) ? JSON.parse(readFileSync(zhFile, 'utf8')) : {}
    for (const key of Object.keys(base)) if (!(key in zh)) add(pkg, 'A', `${relative(root, nls)} ${key}`, base[key], 'missing in package.nls.zh-cn.json')
    for (const key of Object.keys(zh)) if (!(key in base)) add(pkg, 'A', `${relative(root, zhFile)} ${key}`, zh[key], 'missing in package.nls.json')
    for (const [key, value] of Object.entries(base)) checkText(pkg, `${relative(root, nls)} ${key}`, value, 'en')
    for (const [key, value] of Object.entries(zh)) checkText(pkg, `${relative(root, zhFile)} ${key}`, value, 'zh-CN')
  }
}

// --- report ----------------------------------------------------------------------------------------------------------
const KINDS = { A: 'keys', B: 'untranslated', C: 'style/terms', D: 'hard-coded UI text', E: 'CLI output / errors', F: 'locale choice' }
if (asJson) console.log(JSON.stringify(findings, null, 2))
else {
  if (!summaryOnly) for (const f of findings) console.log(`${f.kind} ${f.where}: ${f.note}${f.text ? ` — ${f.text}` : ''}`)
  const table = new Map()
  for (const f of findings) {
    const row = table.get(f.pkg) ?? Object.fromEntries(Object.keys(KINDS).map(k => [k, 0]))
    row[f.kind]++
    table.set(f.pkg, row)
  }
  console.log(`\ni18n: ${catalogs} catalogs; ${banned.zh.length + banned.en.length} glossary terms not to use`)
  console.log(['package'.padEnd(20), ...Object.entries(KINDS).map(([k, v]) => `${k} ${v}`)].join(' | '))
  for (const pkg of packages) {
    const row = table.get(pkg)
    if (row) console.log([pkg.padEnd(20), ...Object.keys(KINDS).map((k, i) => String(row[k]).padStart(Object.values(KINDS)[i].length + 2))].join(' | '))
  }
}
const blocking = findings.filter(f => 'ABC'.includes(f.kind))
if (strict && blocking.length) {
  console.error(`i18n: ${blocking.length} catalog findings`)
  process.exit(1)
}
