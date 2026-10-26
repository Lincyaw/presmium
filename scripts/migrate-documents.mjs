/** One-time offline migration. The production compiler never imports this legacy reader. */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { link, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  legacy: { type: 'string' }, source: { type: 'string' }, root: { type: 'string', default: '.' },
  output: { type: 'string', default: '.presmium/migrated-documents' },
  continue: { type: 'boolean', default: false }, 'plugin-map': { type: 'string' },
  apply: { type: 'boolean', default: false }, workspace: { type: 'boolean', default: false }, help: { type: 'boolean', short: 'h' },
} })
if (values.help || !values.legacy || !positionals.length) {
  console.log('Usage: node scripts/migrate-documents.mjs --legacy <isolated old checkout> [--source <snapshot root>] [--root <destination>] [--output <dry-run directory>] [--apply] [--workspace] <document directory>...\n\nDefault: compile old source, validate normalized lecture.json and write dry-run copies only.\n--apply atomically replaces unchanged lecture.md files after successful validation; never runs speech synthesis.')
  process.exit(values.help ? 0 : 2)
}
if (values.continue && values.apply) throw new Error('--continue is only available for dry-run inventory; apply a validated group without it.')
const pluginMap = values['plugin-map'] ? JSON.parse(values['plugin-map']) : {}
if (!pluginMap || Array.isArray(pluginMap) || typeof pluginMap !== 'object' || Object.values(pluginMap).some(value => typeof value !== 'string')) throw new Error('--plugin-map expects an object of original plugin names to actual project paths.')
const legacy = realpathSync(resolve(values.legacy)), destination = realpathSync(resolve(values.root))
if (legacy === destination) throw new Error('Migration requires a separate legacy checkout with independently linked dependencies.')
const sourceRoot = values.source ? realpathSync(resolve(values.source)) : legacy
const require = createRequire(join(legacy, 'packages/compiler/package.json'))
const { createJiti } = require('jiti')
const jiti = createJiti(import.meta.url)
const { Compiler } = await jiti.import(join(legacy, 'packages/compiler/src/compiler.ts'))
const { Parser } = await jiti.import(join(legacy, 'packages/compiler/src/parser.ts'))
const { findWorkspaceRoot } = await jiti.import(join(legacy, 'packages/compiler/src/workspace.ts'))
const { codeRefs } = await jiti.import(join(legacy, 'packages/addon-code/src/node/directive.ts'))
const { listedPlugins } = await jiti.import(join(legacy, 'packages/compiler/src/plugins.ts'))
const { BUILTIN_DIRECTIVES } = await jiti.import(join(legacy, 'packages/compiler/src/blocks.ts'))
const { mapHtmlUrls } = await jiti.import(fileURLToPath(new URL('../packages/kernel/src/html.ts', import.meta.url)))
const { parseDuration } = await jiti.import(fileURLToPath(new URL('../packages/kernel/src/durations.ts', import.meta.url)))
const { validateDocument, DOCUMENT_ENTRY } = await jiti.import(fileURLToPath(new URL('../packages/kernel/src/document.ts', import.meta.url)))
const hash = text => createHash('sha256').update(text).digest('hex')
const clone = value => JSON.parse(JSON.stringify(value))
const json = value => JSON.stringify(value, null, 2) + '\n'
const records = [], plans = []
const workspace = values.workspace ? { source: join(sourceRoot, 'presmium.workspace.yaml'), target: join(destination, 'presmium.workspace.yaml') } : undefined
if (workspace) {
  workspace.before = await readFile(workspace.source, 'utf8')
  workspace.after = workspace.before.replaceAll('lecture.md', DOCUMENT_ENTRY)
}
for (const name of positionals) {
  try {
  const sourceDir = resolve(sourceRoot, name), targetDir = resolve(destination, name)
  if (relative(sourceRoot, sourceDir).startsWith('..') || relative(destination, targetDir).startsWith('..')) throw new Error(`Document lies outside migration roots: ${name}`)
  const entry = join(sourceDir, 'lecture.md'), before = await readFile(entry, 'utf8')
  const parser = new Parser(BUILTIN_DIRECTIVES)
  const parsed = await parser.read(entry)
  const start = performance.now()
  let workspaceRoot = await findWorkspaceRoot(sourceDir)
  for (let candidate = sourceDir; !relative(sourceRoot, candidate).startsWith('..'); candidate = dirname(candidate)) {
    if (existsSync(join(candidate, 'presmium.workspace.yaml'))) { workspaceRoot = candidate; break }
    if (candidate === sourceRoot || candidate === dirname(candidate)) break
  }
  const plugins = parsed.frontmatter.plugins?.map(name => pluginMap[name] ?? name)
  const frontmatter = { ...parsed.frontmatter, ...plugins ? { plugins } : {} }
  const compilation = await new Compiler(sourceDir, { workspaceRoot, bundled: join(legacy, 'packages/presmium'), ...plugins ? { headmatter: { plugins } } : {} }).compile({ signal: AbortSignal.timeout(30_000) })
  const errors = compilation.doc.diagnostics.filter(d => d.severity === 'error')
  if (errors.length) throw new Error(`${name}: legacy compilation failed: ${json(errors)}`)
  const migrated = convert(compilation.doc, frontmatter, sourceDir, name)
  const validation = validateDocument(migrated)
  if (!validation.document) throw new Error(`${name}: normalized document is invalid: ${json(validation.issues)}`)
  const targetText = json(migrated), dryDir = join(resolve(values.output), name)
  await mkdir(dryDir, { recursive: true })
  await writeFile(join(dryDir, DOCUMENT_ENTRY), targetText)
  await writeFile(join(dryDir, 'legacy-runtime.json'), json(compilation.doc))
  const record = { document: name, before: hash(before), after: hash(targetText), sections: migrated.sectionOrder.length, blocks: Object.keys(migrated.blocks).length, steps: Object.keys(migrated.steps).length, narrations: Object.keys(migrated.narrations).length, definitions: Object.keys(migrated.definitions).length, sourceFiles: compilation.sourceFiles.map(file => relative(sourceDir, file)), diagnostics: validation.issues, ms: performance.now() - start, applied: false }
  const dependencyFiles = new Set(compilation.sourceFiles)
  const collect = block => {
    if (block.node.definition?.file) dependencyFiles.add(block.node.definition.file)
    if (block.node.origin?.file) {
      const file = resolve(compilation.workspaceRoot, block.node.origin.file)
      if (existsSync(file)) dependencyFiles.add(file)
    }
    for (const child of block.node.children ?? []) collect(child)
  }
  for (const section of compilation.doc.sections) for (const block of section.blocks) collect(block)
  const dependencies = []
  for (const file of dependencyFiles) {
    const path = relative(sourceRoot, file)
    if (path.startsWith('..')) throw new Error(`${name}: dependency is outside the source snapshot: ${path}`)
    dependencies.push({ source: file, target: resolve(destination, path), fingerprint: hash(await readFile(file)) })
  }
  record.dependencies = dependencies.map(({ target, fingerprint }) => ({ file: relative(destination, target), fingerprint }))
  plans.push({ name, targetDir, before, targetText, dependencies, record })
  records.push(record)
  } catch (error) {
    if (!values.continue) throw error
    records.push({ document: name, applied: false, error: error instanceof Error ? error.message : String(error) })
  }
}
if (values.apply) {
  // Preflight every source before creating any new authority. A failure leaves all targets untouched.
  if (workspace && await readFile(workspace.target, 'utf8') !== workspace.before) throw new Error('Workspace configuration changed since snapshot; refusing overwrite.')
  for (const plan of plans) {
    for (const dependency of plan.dependencies) if (hash(await readFile(dependency.target)) !== dependency.fingerprint) throw new Error(`${plan.name}: source changed since snapshot: ${relative(destination, dependency.target)}`)
    if (existsSync(join(plan.targetDir, DOCUMENT_ENTRY))) throw new Error(`${plan.name}: ${DOCUMENT_ENTRY} already exists; refusing overwrite.`)
  }
  for (const plan of plans) {
    const targetEntry = join(plan.targetDir, 'lecture.md'), output = join(plan.targetDir, DOCUMENT_ENTRY)
    const temporary = `${output}.migration-${process.pid}`
    if (await readFile(targetEntry, 'utf8') !== plan.before) throw new Error(`${plan.name}: entry changed during migration.`)
    await writeFile(temporary, plan.targetText, { flag: 'wx' })
    try {
      // Hard-link creation publishes the completed file atomically and refuses an unexpected competing output.
      await link(temporary, output)
      if (await readFile(targetEntry, 'utf8') !== plan.before) throw new Error(`${plan.name}: source changed before replacement; keeping the new input.`)
      await rm(targetEntry)
      plan.record.applied = true
    } catch (error) {
      if (existsSync(output) && await readFile(output, 'utf8') === plan.targetText && existsSync(targetEntry)) await rm(output)
      throw error
    } finally { await rm(temporary, { force: true }) }
  }
  if (workspace) {
    const temporary = `${workspace.target}.migration-${process.pid}`
    await writeFile(temporary, workspace.after, { flag: 'wx' })
    try {
      if (await readFile(workspace.target, 'utf8') !== workspace.before) throw new Error('Workspace configuration changed during migration.')
      await rename(temporary, workspace.target)
    } finally { await rm(temporary, { force: true }) }
  }
}
for (const record of records) console.log(json(record).trim())
await mkdir(resolve(values.output), { recursive: true })
await writeFile(join(resolve(values.output), 'migration-report.json'), json(records))

function convert(runtime, frontmatter, sourceDir, name) {
  const metadata = { title: String(frontmatter.title ?? runtime.meta.title), lang: String(frontmatter.lang ?? runtime.meta.lang ?? 'zh-CN') }
  for (const key of ['tags', 'plugins', 'presmium', 'renderers', 'execute', 'checks', 'translations', 'translationOf']) if (frontmatter[key] !== undefined) metadata[key] = clone(frontmatter[key])
  if (metadata.plugins) metadata.plugins = listedPlugins(metadata.plugins)
  if (metadata.translations) for (const key of Object.keys(metadata.translations)) metadata.translations[key] = metadata.translations[key].replace(/lecture\.md(?=$|[?#])/, 'lecture.json')
  if (metadata.translationOf?.entry) metadata.translationOf.entry = metadata.translationOf.entry.replace(/lecture\.md(?=$|[?#])/, 'lecture.json')
  const supported = new Set(['title','lang','tags','plugins','presmium','renderers','execute','checks','translations','translationOf','contentModel'])
  const unknown = Object.keys(frontmatter).filter(key => !supported.has(key))
  if (unknown.length) throw new Error(`${name}: unmapped metadata: ${unknown.join(', ')}`)
  const out = { schemaVersion: 1, id: `document-${hash(name).slice(0, 16)}`, metadata, sectionOrder: [], sections: {}, blocks: {}, steps: {}, narrations: {}, assets: {}, definitions: {}, production: { defaults: {}, stepOverrides: {}, mediaClips: [] } }
  const gap = metadata.renderers?.lecture?.gap
  if (gap !== undefined) {
    const milliseconds = typeof gap === 'number' ? gap : parseDuration(String(gap))
    if (milliseconds === undefined || !Number.isFinite(milliseconds) || milliseconds < 0) throw new Error(`${name}: invalid narration gap`)
    out.production.defaults.trailingPauseMs = milliseconds
    delete metadata.renderers.lecture.gap
  }
  const voice = metadata.renderers?.lecture?.voice
  if (voice) { out.production.defaults.voiceSource = { type: 'tts', voice }; delete metadata.renderers.lecture.voice }
  // Rich-text IDs are also the runtime reference targets. Reserve authored labels before
  // allocating generated IDs so a labelled equation/heading keeps its original target.
  const labelledTypes = new Set(['paragraph', 'heading', 'blockquote', 'list', 'listItem', 'code', 'math', 'table', 'tableRow', 'tableCell'])
  const labels = new Set()
  const reserve = node => {
    if (!node || typeof node !== 'object') return
    if (labelledTypes.has(node.type) && typeof node.identifier === 'string') labels.add(node.identifier)
    for (const child of Object.values(node)) if (child && typeof child === 'object') Array.isArray(child) ? child.forEach(reserve) : reserve(child)
  }
  for (const section of runtime.sections) for (const block of section.blocks) reserve(block.node)
  const globalIds = new Set([out.id])
  const id = (candidate, authored = false) => {
    if (authored && globalIds.has(candidate)) throw new Error(`${name}: duplicate authored reference target ${candidate}`)
    let next = candidate, n = 2
    while (globalIds.has(next) || !authored && labels.has(next)) next = `${candidate}-${n++}`
    globalIds.add(next); return next
  }
  const sectionIds = new Map(runtime.sections.map(section => [section.id, id(section.id)]))
  const blockIds = new Map()
  for (const section of runtime.sections) {
    const register = (block, path = block.id) => {
      blockIds.set(`${section.id}/${path}`, id(`${section.id}--${path.replaceAll('/', '--')}`))
      for (const child of block.node.children ?? []) register(child, `${path}/${child.id}`)
    }
    for (const block of section.blocks) register(block)
  }
  const blockId = (section, local) => blockIds.get(`${section}/${local}`) ?? (() => { const found = [...blockIds].filter(([key]) => key.endsWith(`/${local}`)); if (found.length === 1) return found[0][1]; throw new Error(`${name}: unresolved/ambiguous block reference ${local}`) })()
  for (const old of runtime.sections) {
    const sid = sectionIds.get(old.id), count = Math.max(0, old.steps) + 1
    const stepIds = Array.from({ length: count }, (_, index) => id(`${sid}--step-${index}`))
    const heading = /^(#{1,6})[ \t]+/.exec(readFileSync(old.source.file, 'utf8').split(/\r?\n/)[old.source.line - 1] ?? '')
    const section = { id: sid, title: old.title, level: heading?.[1].length ?? (old.depth === 2 ? 2 : 1), children: [], stepOrder: stepIds, layout: { type: 'stack', ...(Object.keys(old.hints ?? {}).length ? { renderers: clone(old.hints) } : {}) } }
    if (old.audience) section.audience = clone(old.audience)
    const config = clone(old.config ?? {})
    if (config['presmium.lecture']) delete config['presmium.lecture'].resolvedNarrationVoices
    if (Object.values(config).some(value => Object.keys(value).length)) section.config = config
    out.sectionOrder.push(sid); out.sections[sid] = section
    for (const stepId of stepIds) out.steps[stepId] = { id: stepId, sectionId: sid, visuals: [], narrationIds: [] }
    const narrationTargets = new WeakMap()
    const targets = (blocks, nearest) => {
      for (const block of blocks) {
        if (block.role === 'visual') {
          if (!block.only || block.only.includes('web')) nearest = block
          if (block.node.children) targets(block.node.children, nearest)
        } else if (nearest) narrationTargets.set(block, nearest)
      }
    }
    targets(old.blocks)
    const processBlock = (oldBlock, path = oldBlock.id, parent = section.children) => {
      const bid = blockIds.get(`${old.id}/${path}`), node = relocate(oldBlock.node, oldBlock.source.file, sourceDir)
      const authoredCode = oldBlock.node.type === 'code' ? codeRefs.get(oldBlock.node) : undefined
      const rich = richText(node.mdast, `${bid}--text`, id)
      let next
      if (node.type === 'markdown') next = { id: bid, type: 'text', content: rich }
      else if (node.type === 'code') {
        next = { id: bid, type: 'code', language: node.lang ?? '', ...(node.origin?.anchor ? { origin: { anchor: authoredCode?.anchor ?? node.origin.anchor, ...((authoredCode ? authoredCode.pin : node.origin?.pin) ? { pin: authoredCode ? authoredCode.pin : node.origin.pin } : {}), ...(authoredCode?.repo ? { repo: authoredCode.repo } : {}) } } : { value: node.value }) }
        if (node.title) next.title = node.title
        if (node.run) { const { lang: _, ...execution } = node.run; next.execution = clone(execution) }
        if (node.echo === false) next.echo = false
        if (authoredCode?.steps) next.origin.highlightRegions = Object.fromEntries(stepIds.map((step, index) => [step, authoredCode.steps[Math.min(Math.max(0, index - oldBlock.at), authoredCode.steps.length - 1)]]))
        else if (node.highlight) next.highlight = Object.fromEntries(stepIds.map((step, index) => [step, clone(node.highlight[Math.min(Math.max(0, index - oldBlock.at), node.highlight.length - 1)] ?? [])]))
        if (node.variants) {
          if (authoredCode?.variants?.length === node.variants.length) next.variants = node.variants.map((variant, index) => ({ id: id(`${bid}--variant-${index}`), title: variant.label, origin: { anchor: authoredCode.anchor, pin: authoredCode.variants[index], ...(authoredCode.repo ? { repo: authoredCode.repo } : {}) } }))
          else if (!node.origin) next.variants = node.variants.map((variant, index) => ({ id: id(`${bid}--variant-${index}`), title: variant.label, value: variant.value }))
          else throw new Error(`${name}: original code-variant references unavailable for ${bid}`)
        }
      } else if (node.type === 'component') {
        const did = id(`${bid}--definition`), states = Array.from({ length: (oldBlock.span ?? 0) + 1 }, (_, index) => ({ id: `legacy-${index}`, legacyIndex: index }))
        const file = node.definition?.file
        const data = clone(node); delete data.type; delete data.props; delete data.definition; delete data.children
        if (node.definition?.language) data.language = node.definition.language
        out.definitions[did] = { id: did, kind: node.plugin === 'presmium.motion' && node.name === 'PmScene' ? 'scene' : 'component', schemaVersion: 1, implementation: file ? { type: 'file', path: relative(sourceDir, file).split('\\').join('/') } : { type: 'plugin', plugin: node.plugin, name: node.name }, parameterSchema: { type: 'object' }, states, data }
        const parameters = clone(node.props)
        if (node.plugin === 'presmium.exec' && ['PmRunPanel', 'PmStepRun'].includes(node.name)) {
          for (const key of ['code', 'lang', 'place', 'compiledOutput', 'executor', 'session']) delete parameters[key]
          delete data.fallback
        }
        next = { id: bid, type: 'component', definitionId: did, parameters }
      } else throw new Error(`${name}: unsupported IR node ${node.type}`)
      for (const key of ['only','audience']) if (oldBlock[key]) next[key] = clone(oldBlock[key])
      out.blocks[bid] = next; parent.push(bid)
      if (node.type === 'component' && node.children?.length) {
        next.children = []
        for (const child of node.children) processBlock(child, `${path}/${child.id}`, next.children)
      }
      if (node.type === 'markdown' && node.reveal === 'items') {
        const order = next.content.flatMap(item => item.type === 'list' ? item.children.map(child => child.id) : [item.id])
        next.reveal = { type: 'items', order }
      }
      if (oldBlock.role === 'narration' && (!oldBlock.only || oldBlock.only.includes('lecture'))) {
        if (node.type !== 'markdown') throw new Error(`${name}: unsupported non-text narration ${bid}`)
        const nid = id(`${bid}--narration`), content = narration(node.mdast, old.id, blockId, id, out.production, narrationTargets.get(oldBlock))
        out.narrations[nid] = { id: nid, content }
        out.steps[stepIds[Math.min(oldBlock.at, count - 1)]].narrationIds.push(nid)
        if (node.narration) (out.production.narrationOverrides ??= {})[nid] = { narrationStart: node.narration.mode === 'after' ? 'after-animation' : 'with-animation' }
      }
      for (let index = 0; index < count; index++) {
        const visual = { blockId: bid, visible: oldBlock.role === 'visual' && index >= oldBlock.at && (oldBlock.until === undefined || index < oldBlock.until) }
        if (node.type === 'component') visual.state = `legacy-${Math.max(0, Math.min(index - oldBlock.at, oldBlock.span ?? 0))}`
        if (node.type === 'markdown' && node.reveal === 'items') visual.parameters = { revealedItems: Math.max(0, Math.min(index - oldBlock.at + 1, next.reveal.order.length)) }
        out.steps[stepIds[index]].visuals.push(visual)
      }
    }
    for (const oldBlock of old.blocks) processBlock(oldBlock)
  }
  return out
}
function richText(root, prefix, id) {
  if (!root) return []
  const labelledTypes = new Set(['paragraph', 'heading', 'blockquote', 'list', 'listItem', 'code', 'math', 'table', 'tableRow', 'tableCell'])
  const richId = (node, candidate) => id(labelledTypes.has(node.type) && node.identifier ? node.identifier : candidate, labelledTypes.has(node.type) && !!node.identifier)
  const convert = (node, path) => {
    const nid = richId(node, `${prefix}-${path}`), children = node.children ?? []
    if (node.type === 'paragraph') return { id: nid, type: 'paragraph', children: inline(children) }
    if (node.type === 'heading') return { id: nid, type: 'heading', level: node.depth, children: inline(children) }
    if (node.type === 'blockquote') return { id: nid, type: 'blockquote', children: children.map((n,i) => convert(n,`${path}-${i}`)) }
    if (node.type === 'list') return { id: nid, type: 'list', ordered: !!node.ordered, ...(node.start ? { start: node.start } : {}), children: children.map((item,index) => ({ id: richId(item, `${prefix}-${path}-item-${index}`), type: 'listItem', ...(typeof item.checked === 'boolean' ? { checked: item.checked } : {}), children: (item.children ?? []).map((n,i) => convert(n,`${path}-${index}-${i}`)) })) }
    if (node.type === 'code') return { id: nid, type: 'code', language: node.lang ?? '', value: node.value ?? '' }
    if (node.type === 'math') return { id: nid, type: 'math', value: node.value ?? '' }
    if (node.type === 'table') return { id: nid, type: 'table', headerRows: 1, children: children.map((row,r) => ({ id: richId(row, `${prefix}-${path}-row-${r}`), type: 'tableRow', children: (row.children ?? []).map((cell,c) => ({ id: richId(cell, `${prefix}-${path}-cell-${r}-${c}`), type: 'tableCell', children: inline(cell.children ?? []), ...(cell.align ?? node.align?.[c] ? { style: { alignment: cell.align ?? node.align[c] } } : {}) })) })) }
    return { id: nid, type: 'extension', kind: 'presmium.mdast', schemaVersion: 1, data: { node: clone(node) }, fallback: plain(node) ? [{ id: id(`${prefix}-${path}-fallback`), type: 'paragraph', children: [{ type: 'text', text: plain(node) }] }] : [] }
  }
  return (root.type === 'root' ? root.children ?? [] : [root]).map((node,index) => convert(node,index))
}
function inline(nodes, marks = []) {
  return nodes.flatMap(node => {
    if (node.type === 'text') return [{ type: 'text', text: node.value, ...(marks.length ? { marks } : {}) }]
    if (node.type === 'break') return [{ type: 'break' }]
    if (node.type === 'inlineMath') return [{ type: 'math', value: node.value }]
    if (node.type === 'inlineCode') return [{ type: 'text', text: node.value, marks: [...marks, { type: 'code' }] }]
    const mark = { strong: 'bold', emphasis: 'italic', delete: 'strike', underline: 'underline' }[node.type]
    if (mark) return inline(node.children ?? [], [...marks, { type: mark }])
    if (node.type === 'link') return [{ type: 'link', href: node.url, children: inline(node.children ?? [], marks) }]
    return [{ type: 'extension', kind: 'presmium.mdast', schemaVersion: 1, data: { node: clone(node) }, fallback: node.name === 'cue' ? '' : plain(node) }]
  })
}
function narration(root, section, blockId, id, production, nearest) {
  const out = []
  const silent = new Set(['image', 'imageReference', 'html', 'footnoteReference', 'definition', 'footnoteDefinition', 'comment', 'mystComment', 'target', 'mystTarget'])
  const append = text => { if (!text) return; const last=out.at(-1); if (last?.type === 'text') last.text += text; else out.push({ type: 'text', text }) }
  const walk = node => {
    if (silent.has(node.type)) return
    if (node.type === 'presmiumRole' && node.plugin === 'presmium.lecture') {
      const options = node.options ?? {}
      if (node.name === 'say') { out.push({ type: 'pronunciation', display: plain(node) || options.value || '', spoken: options.alias || plain(node) || options.value || '' }); return }
      if (node.name === 'cue') {
        const [action, ...args] = String(options.value ?? '').trim().split(/\s+/), cue = { id: id(`cue-${section}-${out.length}`), type: 'cue', action }
        if (options.to || nearest && ['spot','hint','point','click','run','ink'].includes(action)) cue.target = { blockId: blockId(section, options.to ?? nearest.id), ...(options.sel ? { element: options.sel } : {}) }
        const parameters = { ...(args.length ? { arg: args.join(' ') } : {}), ...(options.lines ? { lines: options.lines } : {}) }
        if (action === 'pause') {
          const pauseMs = parseDuration(args.join(' '))
          if (pauseMs === undefined) throw new Error(`Invalid pause cue in ${section}: ${options.value}`)
          ;(production.cueTimings ??= {})[cue.id] = { pauseMs }
          delete parameters.arg
        }
        if (Object.keys(parameters).length) cue.parameters = parameters
        out.push(cue); return
      }
    }
    if (node.type === 'break') { append('\n'); return }
    if (typeof node.value === 'string' && !node.children) { append(node.value); return }
    const separated = ['paragraph','listItem','heading','blockquote'].includes(node.type)
    if (separated && out.length && !out.at(-1)?.text?.endsWith('\n')) append('\n')
    for (const child of node.children ?? []) walk(child)
    if (separated) append('\n')
  }
  walk(root)
  if (out[0]?.type === 'text') out[0].text = out[0].text.trimStart()
  if (out.at(-1)?.type === 'text') out.at(-1).text = out.at(-1).text.trimEnd()
  return out.filter(node => node.type !== 'text' || node.text)
}
function plain(node) { return typeof node.value === 'string' && !node.children ? node.value : (node.children ?? []).map(plain).join('') }

/** Source locations disappear at normalization, so authored resource URLs must retain their original base. */
function relocate(node, sourceFile, documentDir) {
  const next = clone(node)
  const url = value => {
    if (typeof value !== 'string' || /^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(value)) return value
    const [, path, suffix] = /^([^?#]*)(.*)$/s.exec(value)
    if (!path) return value
    let decoded
    // Invalid legacy URLs remain invalid data and retain their diagnostic; do not
    // silently replace them or prevent the rest of the document from migrating.
    try { decoded = decodeURIComponent(path) } catch { return value }
    const target = relative(documentDir, resolve(dirname(sourceFile), decoded)).split('\\').join('/').split('/').map(part => encodeURIComponent(part)).join('/')
    return target.replace(/lecture\.md$/, 'lecture.json') + suffix
  }
  const walk = item => {
    if (!item || typeof item !== 'object') return
    if (typeof item.url === 'string') item.url = url(item.url)
    if (item.type === 'html' && typeof item.value === 'string') item.value = mapHtmlUrls(item.value, value => url(value))
    if (item.assets && typeof item.assets === 'object') for (const key of Object.keys(item.assets)) item.assets[key] = url(item.assets[key])
    if (item.type === 'presmiumRole' && item.plugin === 'presmium.lecture' && item.name === 'cue') return
    for (const [key, child] of Object.entries(item)) if (key !== 'definition' && key !== 'children') walk(child)
    // Component children retain their own source bases and are relocated individually by processBlock.
    if (item.type !== 'component') for (const child of item.children ?? []) walk(child)
  }
  walk(next)
  return next
}
