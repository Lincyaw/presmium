import { readFile } from 'node:fs/promises'
import { isRenderable } from '@presmium/kernel'
import type { Check, CheckContext, DeckSlide, Finding, Resolution } from '@presmium/kernel'
import { driftDiff, findCodeRefBlocks, highlightSteps, parseCodeRef, toSnippet } from '../domain/index.ts'
import type { CodeRefSpec } from '../domain/index.ts'
import { openWorkspace } from './git.ts'
import { errorMessage, repoFor } from './transform.ts'

/** A coderef block in the deck. */
interface Usage {
  slide: DeckSlide
  /** Line of the opening fence. */
  source: { file: string, line: number }
  spec?: CodeRefSpec
  error?: string
}

const usageCache = new WeakMap<CheckContext, Promise<Usage[]>>()

/** Coderef blocks of the deck, parsed once per check run. */
export function usages(ctx: CheckContext): Promise<Usage[]> {
  let result = usageCache.get(ctx)
  if (!result) usageCache.set(ctx, result = collect(ctx.slides))
  return result
}

async function collect(slides: DeckSlide[]): Promise<Usage[]> {
  const result: Usage[] = []
  for (const slide of slides) {
    const blocks = findCodeRefBlocks(slide.content)
    if (blocks.length === 0) continue
    const text = await readFile(slide.file, 'utf8').catch(() => '')
    // The slide content sits in its file after the frontmatter; locate it to report exact lines.
    const slideStart = text.split('\n').slice(0, slide.line - 1).join('\n').length
    const at = text.indexOf(slide.content, slideStart)
    const contentLine = at < 0 ? undefined : text.slice(0, at).split('\n').length
    for (const block of blocks) {
      const source = { file: slide.file, line: contentLine === undefined ? slide.line : contentLine + block.line }
      try {
        result.push({ slide, source, spec: parseCodeRef(block.body) })
      }
      catch (error) {
        result.push({ slide, source, error: errorMessage(error) })
      }
    }
  }
  return result
}

type Emit = (severity: Finding['severity'], message: string, hint?: string) => void

/** Runs `body` for each valid coderef, collecting its findings at the block's location. */
function eachCodeRef(id: string, body: (usage: Usage & { spec: CodeRefSpec }, emit: Emit, ctx: CheckContext) => Promise<void>): Check {
  return {
    id,
    async run(ctx) {
      const findings: Finding[] = []
      for (const usage of await usages(ctx)) {
        if (!usage.spec) continue
        const emit: Emit = (severity, message, hint) => findings.push({ checkId: id, severity, message, source: usage.source, ...(hint ? { hint } : {}) })
        await body({ ...usage, spec: usage.spec }, emit, ctx)
      }
      return findings
    },
  }
}

const syntax: Check = {
  id: 'presmium.code.syntax',
  async run(ctx) {
    return (await usages(ctx)).filter(u => u.error).map(u => ({
      checkId: 'presmium.code.syntax',
      severity: 'error',
      message: `invalid coderef block: ${u.error}`,
      source: u.source,
    }))
  },
}

const LOCK_HINT = 'run presmium check --update-lock to record the current location'

/** Anchor health: lost (error), fuzzy (warning), moved or changed since locked (info); pinned and variant commits; step units. */
const anchors = eachCodeRef('presmium.code.anchors', async ({ spec }, emit, ctx) => {
  const recorded = ctx.lock.anchors[spec.anchor]
  const current = await ctx.resolvers.resolve(spec.anchor, ctx.src, recorded)
  const where = current.location && `${current.location.file}:${current.location.startLine}`
  if (current.status === 'lost') emit('error', `anchor ${spec.anchor} is lost: ${current.message}`, 'restore the #region markers or the declaration, or fix the anchor')
  if (current.status === 'fuzzy') emit('warning', `anchor ${spec.anchor} needs confirmation: ${current.message}`, `point the anchor at the right candidate, then ${LOCK_HINT}`)
  if (current.status === 'moved') emit('info', `anchor ${spec.anchor} moved to ${where}`, LOCK_HINT)
  if (current.status === 'exact' && recorded && recorded.fingerprint !== current.fingerprint) {
    emit('info', `code at ${spec.anchor} changed since the anchor was locked`, LOCK_HINT)
  }

  const workspace = openWorkspace(ctx.workspaceRoot)
  let shown: Resolution | undefined = spec.pin ? undefined : current
  for (const rev of spec.variants ?? (spec.pin ? [spec.pin] : [])) {
    const commit = await workspace.commit(rev)
    if (!commit) {
      emit('error', `commit "${rev}" of ${spec.anchor} not found`, 'use a commit of this repository')
      continue
    }
    const resolution = await ctx.resolvers.resolve(spec.anchor, ctx.src, undefined, commit)
    if (!isRenderable(resolution)) emit('error', `anchor ${spec.anchor} cannot be read at ${rev}: ${resolution.message}`)
    else if (rev === spec.pin) shown = resolution
  }
  if (spec.steps && shown?.location && isRenderable(shown)) {
    try {
      highlightSteps(spec.steps, toSnippet(shown.location.text).units)
    }
    catch (error) {
      emit('error', errorMessage(error), 'add nested #region markers for each step')
    }
  }
})

/** Drift (P-14): the working tree no longer has the code of the pinned commit. */
const drift = eachCodeRef('presmium.code.drift', async ({ spec }, emit, ctx) => {
  if (!spec.pin) return
  const commit = await openWorkspace(ctx.workspaceRoot).commit(spec.pin)
  if (!commit) return
  const pinned = await ctx.resolvers.resolve(spec.anchor, ctx.src, undefined, commit)
  const current = await ctx.resolvers.resolve(spec.anchor, ctx.src)
  if (!isRenderable(pinned) || !isRenderable(current) || pinned.fingerprint === current.fingerprint) return
  const diff = driftDiff(pinned.location!.file, { commit, text: pinned.location!.text }, { label: 'working-tree', text: current.location!.text })
  emit('warning', `code at ${spec.anchor} drifted since pinned commit ${spec.pin}`, `review the change, then update the code or the pin:\n${diff}`)
})

/** Permalinks (P-13) need a remote repository; without one the slides show plain paths. */
const links = eachCodeRef('presmium.code.links', async ({ spec, slide }, emit, ctx) => {
  if (await repoFor(openWorkspace(ctx.workspaceRoot), ctx.headmatter, slide.frontmatter)) return
  emit('info', `no remote repository for ${spec.anchor}; it is shown without a permalink`, 'set presmium.code.repo in the headmatter or add an origin remote')
})

export const codeChecks: Check[] = [syntax, anchors, drift, links]
