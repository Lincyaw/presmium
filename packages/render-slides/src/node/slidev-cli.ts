import { errorMessage, irBlocks, nodeMdast } from '@lincyaw/kernel'
import type { IRDocument, MdastNode, RenderContext } from '@lincyaw/kernel'
import { findPackageBin, forEachLine, spawnBackgroundNode, spawnInteractiveNode } from '@lincyaw/kernel/node'

function slidevBin(): string {
  const bin = findPackageBin('@slidev/cli', 'slidev', import.meta.url)
  if (!bin) throw new Error('@slidev/cli is not installed')
  return bin
}

export class SlidevError extends Error {
  readonly output: string
  constructor(message: string, output: string) {
    super(`${message}\n${output.slice(-4000)}`)
    this.output = output
  }
}

/**
 * Runs a Slidev command in the project's directory, its output a line at a time to `log`; rejects with its output when
 * it fails, and with the signal's reason when `signal` stops it.
 */
export function runSlidev(args: string[], cwd: string, log?: (line: string) => void, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason as Error)
    const child = spawnBackgroundNode(slidevBin(), args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout!.on('data', (chunk: Buffer) => output += chunk)
    child.stderr!.on('data', (chunk: Buffer) => output += chunk)
    if (log) for (const stream of [child.stdout, child.stderr]) forEachLine(stream, log)
    const stop = () => child.kill('SIGTERM')
    signal?.addEventListener('abort', stop, { once: true })
    child.on('error', reject)
    child.on('close', (code) => {
      signal?.removeEventListener('abort', stop)
      if (signal?.aborted) reject(signal.reason as Error)
      else if (code === 0) resolve()
      else reject(new SlidevError(`slidev ${args[0]} exited with code ${code}`, output))
    })
  })
}

/** Starts Slidev's dev server for the project and resolves with its address once it prints it. */
export function startSlidevDev(dir: string, args: string[]): Promise<{ url: string, close(): Promise<void> }> {
  // The author waits for the preview: the dev server takes the interactive thread budget, at normal priority.
  const child = spawnInteractiveNode(slidevBin(), ['slides.md', ...args], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] })
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
  const close = async () => {
    if (child.exitCode === null) child.kill('SIGTERM')
    await exited
  }
  return new Promise((resolve, reject) => {
    let output: string | undefined = ''
    child.stderr!.on('data', (chunk: Buffer) => {
      if (output !== undefined) output += chunk
    })
    child.stdout!.on('data', (chunk: Buffer) => {
      if (output === undefined) return
      output += chunk
      const url = /(http:\/\/localhost:\d+\/\S*)/.exec(output.replace(/\x1B\[[\d;]*m/g, ''))?.[1]
      if (!url) return
      output = undefined
      resolve({ url, close })
    })
    child.once('error', reject)
    child.once('exit', code => reject(new Error(`slidev exited with code ${code}\n${output?.slice(-4000) ?? ''}`)))
  })
}

const hasHtml = (node: MdastNode): boolean => node.type === 'html' || (node.children ?? []).some(hasHtml)

/**
 * Reports a failed `slidev build` at the slide it names, on the raw HTML block that most likely broke it, and returns the
 * error to throw; an error that names no slide is returned as it is.
 */
export function reportBuildFailure(error: unknown, doc: IRDocument, ctx: RenderContext): unknown {
  const output = error instanceof SlidevError ? error.output : errorMessage(error)
  const at = /slides\.md__slidev_(\d+)\.md(?::\d+(?::\d+)?)?\s*\n(?:\w*Error: )?([^\n]+)/.exec(output)
  const section = at && doc.sections[Number(at[1]) - 1]
  if (!at || !section) return error
  const reason = at[2]!.replace(/^\w*Error: /, '').trim()
  const raw = [...irBlocks(section.blocks)].filter(block => block.role === 'visual' && nodeMdast(block.node).some(hasHtml))
  const source = raw.length === 1 ? raw[0]!.source : section.source
  ctx.report({
    checkId: 'presmium.slides',
    severity: 'error',
    message: `slide ${at[1]} (${section.title || section.id}) does not build: ${reason}`,
    source: { file: source.file, line: source.line },
  })
  return new Error(`slidev build failed at slide ${at[1]}: ${reason}`)
}
