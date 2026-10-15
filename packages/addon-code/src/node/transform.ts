import { resolve } from 'node:path'
import { createAnchorResolverRegistry, isRenderable } from '@presmium/kernel'
import type { AnchorString, MarkdownTransformInput, PresentationMode, ResolvedLocation } from '@presmium/kernel'
import {
  codeConfig,
  findCodeRefBlocks,
  highlightSteps,
  indent,
  lineRange,
  parseCodeRef,
  permalink,
  regionResolver,
  renderCodeRef,
  repoWebUrl,
  splitTarget,
  toSnippet,
} from '../domain/index.ts'
import type { CodeRefSpec, CodeRefView, CodeVersion } from '../domain/index.ts'
import { openWorkspace } from './git.ts'
import type { Repository, Workspace } from './git.ts'
import { symbolResolver } from './symbol.ts'

/** Resolvers of the anchor schemes code references accept. */
export const codeResolvers = createAnchorResolverRegistry([regionResolver, symbolResolver])

/**
 * Web URL of a repository for permalinks: for the workspace's own repository
 * `presmium.code.repo` of the slide or deck when set, otherwise the `origin` remote.
 */
export async function repoUrl(repo: Repository, configured: string | undefined): Promise<string | undefined> {
  return repoWebUrl((repo.prefix ? undefined : configured) ?? await repo.remote())
}

/** The repository holding the file an anchor names. */
export function repositoryOf(workspace: Workspace, anchor: AnchorString): Promise<Repository> {
  return workspace.repository(splitTarget(anchor)?.file ?? '')
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

interface Snapshot {
  /** Full hash; undefined for the working tree. */
  commit?: string
  location: ResolvedLocation
  fingerprint?: string
}

/** The code an anchor names at a revision (the working tree when omitted); throws when it cannot be rendered. */
export async function snapshot(workspace: Workspace, anchor: AnchorString, rev?: string): Promise<Snapshot> {
  const commit = rev === undefined ? undefined : await (await repositoryOf(workspace, anchor)).commit(rev)
  if (rev !== undefined && !commit) throw new Error(`commit "${rev}" not found`)
  const resolution = await codeResolvers.resolve(anchor, workspace.src, undefined, commit)
  if (!isRenderable(resolution) || !resolution.location) throw new Error(resolution.message ?? `anchor ${anchor} is ${resolution.status}`)
  return { commit, location: resolution.location, fingerprint: resolution.fingerprint }
}

interface Env {
  workspace: Workspace
  /** `presmium.code.repo` of the slide or deck. */
  repo?: string
}

async function link(env: Env, commit: string | undefined, { file, startLine, endLine }: ResolvedLocation): Promise<string | undefined> {
  if (!commit) return undefined
  const repo = await env.workspace.repository(file)
  const url = await repoUrl(repo, env.repo)
  return url && permalink(url, commit, repo.path(file), startLine, endLine)
}

async function single(spec: CodeRefSpec, env: Env): Promise<{ view: CodeRefView, versions: CodeVersion[] }> {
  const shown = await snapshot(env.workspace, spec.anchor, spec.pin)
  const snippet = toSnippet(shown.location.text)
  // Unpinned code links to HEAD, where its lines may differ from the working tree.
  const linked = shown.commit ? shown : await snapshot(env.workspace, spec.anchor, 'HEAD').catch(() => undefined)
  const { file, startLine, endLine } = shown.location
  const view: CodeRefView = {
    anchor: spec.anchor,
    file,
    lines: lineRange(startLine, endLine),
    commit: shown.commit,
    pinned: spec.pin !== undefined,
    href: linked && await link(env, linked.commit, linked.location),
  }
  if (shown.commit) {
    const current = await codeResolvers.resolve(spec.anchor, env.workspace.src)
    view.drift = isRenderable(current) && current.fingerprint === shown.fingerprint ? 'synced' : 'drifted'
  }
  if (spec.steps) {
    view.steps = highlightSteps(spec.steps, snippet.units)
    view.at = spec.at
  }
  return { view, versions: [{ code: snippet.code, label: shown.commit?.slice(0, 7) ?? file }] }
}

async function variants(spec: CodeRefSpec, revs: string[], env: Env): Promise<{ view: CodeRefView, versions: CodeVersion[] }> {
  const shots = await Promise.all(revs.map(rev => snapshot(env.workspace, spec.anchor, rev)))
  const view: CodeRefView = {
    anchor: spec.anchor,
    file: shots.at(-1)!.location.file,
    variants: await Promise.all(shots.map(async s => ({ commit: s.commit!, lines: lineRange(s.location.startLine, s.location.endLine), href: await link(env, s.commit, s.location) }))),
    // An absolute click, so that the component knows which version Magic Move shows.
    at: spec.at ?? 1,
  }
  const versions = shots.map(s => ({ code: toSnippet(s.location.text).code, label: s.commit!.slice(0, 7) }))
  return { view, versions }
}

function langOf(file: string | undefined): string {
  const ext = /\.([\w-]+)$/.exec(file ?? '')?.[1]
  return ext ?? 'text'
}

async function renderBlock(body: string, env: Env, mode: PresentationMode): Promise<string> {
  let spec: CodeRefSpec | undefined
  try {
    spec = parseCodeRef(body)
    const { view, versions } = spec.variants ? await variants(spec, spec.variants, env) : await single(spec, env)
    return renderCodeRef(view, spec.lang ?? langOf(view.file), versions, mode)
  }
  catch (error) {
    return renderCodeRef({ anchor: spec?.anchor ?? '', error: errorMessage(error) }, '', [], mode)
  }
}

/**
 * Expands ```` ```coderef ```` blocks into `<PmCodeRef>` around standard code
 * blocks, in both forms. A block that cannot be resolved renders an error in
 * place; `presmium check` reports it with its source location.
 */
export async function transformCodeRefs(input: MarkdownTransformInput): Promise<string> {
  const blocks = findCodeRefBlocks(input.content)
  if (blocks.length === 0) return input.content
  const env: Env = { workspace: openWorkspace(input.workspaceRoot), repo: codeConfig(input.headmatter, input.frontmatter).repo }
  let out = ''
  let last = 0
  for (const block of blocks) {
    out += input.content.slice(last, block.start) + indent(await renderBlock(block.body, env, input.mode), block.indent)
    last = block.end
  }
  return out + input.content.slice(last)
}

/**
 * Absolute paths of the files that the code references of a slide depend on
 * (K-09): the referenced files, and the git refs behind revisions that can
 * move, such as HEAD for unpinned code, whose permalink points at HEAD.
 */
export async function watchedFiles(content: string, workspaceRoot: string): Promise<string[]> {
  const workspace = openWorkspace(workspaceRoot)
  const files = new Set<string>()
  for (const block of findCodeRefBlocks(content)) {
    let spec: CodeRefSpec
    try {
      spec = parseCodeRef(block.body)
    }
    catch {
      continue
    }
    const file = splitTarget(spec.anchor)?.file
    if (!file) continue
    files.add(resolve(workspaceRoot, file))
    const repo = await workspace.repository(file)
    for (const rev of spec.variants ?? [spec.pin ?? 'HEAD']) (await repo.refFiles(rev)).forEach(f => files.add(f))
  }
  return [...files]
}
