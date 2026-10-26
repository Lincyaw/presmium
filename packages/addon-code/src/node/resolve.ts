import { existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { docBlocks, errorMessage, isRenderable } from '@lincyaw/kernel'
import type { AnchorString, CodeNode, CodeVariant, IRDocument, IRPass, PassContext, Resolution, ResolutionStatus, ResolvedLocation, Severity } from '@lincyaw/kernel'
import { driftDiff, highlightSteps, originUnits, permalink, repoWebUrl, splitTarget, toCodeConfig, toSnippet } from '../domain/index.ts'
import type { CodeRefSpec } from '../domain/index.ts'
import { codeRefs } from './directive.ts'
import { openGitTree } from './git-tree.ts'
import type { GitTree, Repository } from './git-tree.ts'

const LOCK_HINT = 'run presmium check --update-lock to record the current location'

/** The code an anchor points at, in the working tree or at a commit. */
interface CodeSnapshot {
  commit?: string
  location: ResolvedLocation
  fingerprint?: string
  status: ResolutionStatus
}

type Report = (checkId: string, severity: Severity, message: string, hint?: string) => void

export const codeRefPass: IRPass = {
  name: 'presmium.code.resolve',
  async run(doc, ctx) {
    const own = openGitTree(ctx.workspaceRoot)
    const tree: GitTree = { ...own, src: { read: (file, ref) => (ref === undefined ? ctx.src.read(file) : own.src.read(file, ref)) } }
    for (const { section, block } of docBlocks(doc)) {
      const reference = block.node.type === 'code' ? block.node.reference : undefined
      const spec = block.node.type === 'code' ? codeRefs.get(block.node) ?? (reference ? { anchor: reference.anchor, ...reference.pin ? { pin: reference.pin } : {}, ...reference.repo ? { repo: reference.repo } : {}, ...reference.highlightRegions ? { steps: reference.highlightRegions } : {} } : undefined) : undefined
      if (!spec) continue
      const report: Report = (checkId, severity, message, hint) =>
        ctx.report({ checkId, severity, message, source: { ...block.source }, ...hint ? { hint } : {} })
      const code = block.node as CodeNode
      const repo = reference?.repo ?? toCodeConfig(ctx.configFor(section)).repo
      if (code.origin) await resolveCodeRef(code, spec, repo, tree, ctx, report)
      if (reference?.variants) {
        const variants: CodeVariant[] = []
        for (const variant of reference.variants) {
          if (variant.value !== undefined) { variants.push({ label: variant.label, value: variant.value }); continue }
          if (!variant.anchor) continue
          const snapshot: CodeNode = { type: 'code', lang: code.lang, value: '', origin: { anchor: variant.anchor, file: '', startLine: 0, endLine: 0, status: 'lost' } }
          await resolveCodeRef(snapshot, { anchor: variant.anchor, ...variant.pin ? { pin: variant.pin } : {}, ...variant.repo ? { repo: variant.repo } : {} }, repo, tree, ctx, report)
          if (snapshot.origin?.status !== 'lost') variants.push({ label: variant.label, value: snapshot.value, startLine: snapshot.origin!.startLine, endLine: snapshot.origin!.endLine, ...snapshot.origin?.permalink ? { permalink: snapshot.origin.permalink } : {} })
        }
        code.variants = variants
      }
    }
  },
}

export function codeRefAnchors(doc: IRDocument | undefined): AnchorString[] {
  if (!doc) return []
  return [...docBlocks(doc)].flatMap(({ block: { node } }) => node.type === 'code' && node.origin?.anchor ? [node.origin.anchor] : [])
}

async function lostMessage(anchor: AnchorString, message: string | undefined, tree: GitTree, ctx: PassContext): Promise<[string, string]> {
  const file = splitTarget(anchor)?.file
  const restore = 'restore the #region markers, the declaration or the code the pattern matches, or fix the anchor'
  if (file === undefined || await tree.src.read(file) !== undefined) return [`anchor ${anchor} is lost: ${message}`, restore]
  const root = relative(ctx.deckDir, ctx.workspaceRoot).split(sep).join('/') || '.'
  const fromDeck = relative(ctx.workspaceRoot, join(ctx.deckDir, file)).split(sep).join('/')
  const hint = existsSync(join(ctx.deckDir, file)) && !fromDeck.startsWith('..')
    ? `${file} is a file of the deck's directory; from the repository root it is ${fromDeck}: write ${anchor.replace(file, fromDeck)}`
    : 'write the path of the file from the repository root'
  return [`anchor ${anchor} is lost: ${file} not found under the repository root (${root}); anchor paths are relative to the repository root`, hint]
}

async function resolveCodeRef(node: CodeNode, spec: CodeRefSpec, configuredRepo: string | undefined, tree: GitTree, ctx: PassContext, report: Report): Promise<void> {
  const { anchor } = spec
  if (splitTarget(anchor)?.file.split(/[\\/]/).includes('.git')) {
    report('presmium.code.anchors', 'error', `anchor ${anchor} names a file in .git, which holds git's data, not code`, 'point the anchor at a file of the working tree')
    node.origin!.status = 'lost'
    return
  }
  const current = await resolveInWorkingTree(anchor, tree, ctx, report)
  const repo = await tree.repository(splitTarget(anchor)?.file ?? '')
  const snapshots = await takeSnapshots(spec, current, repo, tree, ctx, report)
  const url = await repoUrl(repo, spec.repo ?? configuredRepo)
  const shown = snapshots.at(-1)
  if (!shown || snapshots.length < (spec.variants?.length ?? 1)) {
    if (current.location) Object.assign(node.origin!, { file: current.location.file, startLine: current.location.startLine, endLine: current.location.endLine })
    node.origin!.status = current.status
    return
  }
  const link = (snapshot: CodeSnapshot | undefined) => url && snapshot?.commit ? permalink(url, snapshot.commit, repo.path(snapshot.location.file), snapshot.location.startLine, snapshot.location.endLine) : undefined
  await writeCode(node, spec, snapshots, current, link, repo, tree, ctx, report)
}

/** Resolves the anchor in the working tree and reports how it changed since the lock recorded it. */
async function resolveInWorkingTree(anchor: AnchorString, tree: GitTree, ctx: PassContext, report: Report): Promise<Resolution> {
  const recorded = ctx.lock.anchors[anchor]
  const current = await ctx.resolvers.resolve(anchor, tree.src, recorded)
  const where = current.location && `${current.location.file}:${current.location.startLine}`
  if (current.status === 'lost') report('presmium.code.anchors', 'error', ...await lostMessage(anchor, current.message, tree, ctx))
  if (current.status === 'fuzzy') {
    report('presmium.code.anchors', 'warning', `anchor ${anchor} needs confirmation: ${current.message}`, `point the anchor at the right candidate, then ${LOCK_HINT}`)
  }
  if (current.status === 'moved') report('presmium.code.anchors', 'info', `anchor ${anchor} moved to ${where}`, LOCK_HINT)
  if (current.status === 'exact' && recorded && recorded.fingerprint !== current.fingerprint) {
    report('presmium.code.anchors', 'info', `code at ${anchor} changed since the anchor was locked`, LOCK_HINT)
  }
  return current
}

/** The code to show: of each variant's commit, of the pinned commit, or of the working tree. */
async function takeSnapshots(spec: CodeRefSpec, current: Resolution, repo: Repository, tree: GitTree, ctx: PassContext, report: Report): Promise<CodeSnapshot[]> {
  const { anchor } = spec
  const snapshots: CodeSnapshot[] = []
  for (const rev of spec.variants ?? [spec.pin]) {
    if (rev === undefined) {
      if (isRenderable(current)) snapshots.push({ location: current.location!, fingerprint: current.fingerprint, status: current.status })
      continue
    }
    const commit = await repo.commit(rev)
    if (!commit) {
      report('presmium.code.anchors', 'error', `commit "${rev}" of ${anchor} not found`, 'use a commit of the repository that holds the file')
      continue
    }
    const resolution = await ctx.resolvers.resolve(anchor, tree.src, undefined, commit)
    if (!isRenderable(resolution)) report('presmium.code.anchors', 'error', `anchor ${anchor} cannot be read at ${rev}: ${resolution.message}`)
    else snapshots.push({ commit, location: resolution.location!, fingerprint: resolution.fingerprint, status: resolution.status })
  }
  return snapshots
}

/** Writes the code of the last snapshot into the node: its value, origin, variants, highlighted steps and drift. */
async function writeCode(node: CodeNode, spec: CodeRefSpec, snapshots: CodeSnapshot[], current: Resolution, link: (snapshot: CodeSnapshot | undefined) => string | undefined, repo: Repository, tree: GitTree, ctx: PassContext, report: Report): Promise<void> {
  const { anchor } = spec
  const shown = snapshots.at(-1)!
  const snippet = toSnippet(shown.location.text)
  const { file, startLine, endLine } = shown.location
  const linked = shown.commit ? shown : await snapshotAtHead(anchor, repo, tree, ctx)
  node.value = snippet.code
  node.origin = { anchor, file, startLine, endLine, status: shown.status, units: originUnits(snippet.regions) }
  const origin = node.origin
  if (shown.commit) origin.pin = shown.commit
  const href = link(linked)
  if (href) origin.permalink = href

  if (spec.variants) {
    node.variants = snapshots.map((snapshot): CodeVariant => {
      const variant: CodeVariant = { label: snapshot.commit!.slice(0, 7), value: toSnippet(snapshot.location.text).code, startLine: snapshot.location.startLine, endLine: snapshot.location.endLine }
      const href = link(snapshot)
      if (href) variant.permalink = href
      return variant
    })
    return
  }
  if (spec.steps) {
    try {
      node.highlight = highlightSteps(spec.steps, snippet.regions)
    }
    catch (error) {
      report('presmium.code.anchors', 'error', errorMessage(error), 'add nested #region markers for each step')
    }
  }
  if (shown.commit) {
    origin.drift = isRenderable(current) && current.fingerprint === shown.fingerprint ? 'synced' : 'drifted'
    if (isRenderable(current) && origin.drift === 'drifted') {
      const diff = driftDiff(file, { commit: shown.commit, text: shown.location.text }, { label: 'working-tree', text: current.location!.text })
      report('presmium.code.drift', 'warning', `code at ${anchor} drifted since pinned commit ${spec.pin}`, `review the change, then update the code or the pin:\n${diff}`)
    }
  }
}

async function snapshotAtHead(anchor: AnchorString, repo: Repository, tree: GitTree, ctx: PassContext): Promise<CodeSnapshot | undefined> {
  const commit = await repo.commit('HEAD')
  if (!commit) return undefined
  const resolution = await ctx.resolvers.resolve(anchor, tree.src, undefined, commit)
  return isRenderable(resolution) ? { commit, location: resolution.location!, status: resolution.status } : undefined
}

async function repoUrl(repo: Repository, configured: string | undefined): Promise<string | undefined> {
  return repoWebUrl((repo.prefix ? undefined : configured) ?? await repo.remote())
}
