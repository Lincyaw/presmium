import { escapeHtml, languageId } from '@lincyaw/kernel'
import type { CodeNode, IRBlock, IRDocument, RunOutput, RunResult } from '@lincyaw/kernel'
import { fence } from './code-fences.ts'
import { findPackageDir } from './deck-addons.ts'
import { IMAGE_TYPES, imageUrl, INLINE_IMAGE, joined } from './deck-outputs.ts'
import type { Generation } from './generation.ts'

/** The languages Slidev's `{monaco-run}` runs in the slides, by the Monaco language of each. */
const MONACO_RUN_LANGS: Record<string, string> = {
  'python': 'python',
  'javascript': 'javascript',
  'typescript': 'typescript',
  'c': 'c',
  'cpp': 'cpp',
  'c++': 'cpp',
  'cc': 'cpp',
  'cxx': 'cpp',
  'ruby': 'ruby',
  'rb': 'ruby',
  'sql': 'sql',
  'sqlite': 'sql',
}

const monacoRunLang = (lang: string): string | undefined => Object.hasOwn(MONACO_RUN_LANGS, languageId(lang)) ? MONACO_RUN_LANGS[languageId(lang)] : undefined

const liveRunKey = (section: string, block: string) => `${section}/${block}`

/** Whether a code block runs live in the slides, as `{monaco-run}`: it runs in the browser, alone, in a language that can. */
export function runsLive(node: CodeNode, gen: Generation): boolean {
  return Boolean(gen.live && node.run && node.run.when !== 'compile' && node.echo !== false && !node.variants?.length && !node.highlight?.length && monacoRunLang(node.lang))
}

function liveCodeNodes(blocks: IRBlock[], gen: Generation, parents: string[] = [], owned = false): { node: CodeNode, path: string }[] {
  return blocks.flatMap((block) => {
    const { node } = block
    const path = [...parents, block.id]
    if (node.type === 'component') return liveCodeNodes(node.children ?? [], gen, path, node.ownsCode !== false)
    return node.type === 'code' && !owned && runsLive(node, gen) ? [{ node, path: path.join('/') }] : []
  })
}

function importedPackages(code: string): string[] {
  const names = [...code.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*(['"])([^'"\n]+)\1/g)].map(match => match[2]!)
  return names
    .filter(name => !/^[./]/.test(name) && !name.includes(':'))
    .map(name => name.split('/').slice(0, name.startsWith('@') ? 2 : 1).join('/'))
}

/** `monacoTypesSource: none` when live JavaScript or TypeScript imports a package the deck has not installed, whose types Monaco cannot load. */
export function monacoTypesSource(doc: IRDocument, gen: Generation): Record<string, unknown> {
  const jsCode = doc.sections.flatMap(section => liveCodeNodes(section.blocks, gen)).map(item => item.node)
    .filter(node => ['javascript', 'typescript'].includes(monacoRunLang(node.lang)!))
  return jsCode.some(node => importedPackages(node.value).some(name => !findPackageDir(name, gen.dir))) ? { monacoTypesSource: 'none' } : {}
}

function liveRunRecording(run: RunResult, gen: Generation): Record<string, unknown> {
  const outputs = run.outputs?.map((output): RunOutput => {
    if (output.output_type !== 'display_data' && output.output_type !== 'execute_result') return output
    const image = Object.keys(IMAGE_TYPES).find(type => output.data[type] !== undefined)
    const base64 = image && joined(output.data[image]).replace(/\s/g, '')
    if (!image || !base64 || base64.length <= INLINE_IMAGE) return output
    return { ...output, data: { 'text/html': `<img class="pm-run-image" alt="" src="${escapeHtml(imageUrl(image, base64, gen))}">` } }
  })
  return { ok: run.ok, stdout: run.stdout, stderr: run.stderr, ...outputs ? { outputs } : {} }
}

/** The headmatter's `presmiumRuns`: for each live code block, its executor, run session, time limit and recording. */
export function liveRunOptions(doc: IRDocument, gen: Generation): Record<string, unknown> {
  const runs: Record<string, Record<string, unknown>> = {}
  for (const section of doc.sections) {
    for (const { node, path } of liveCodeNodes(section.blocks, gen)) {
      const { executor, session, timeoutMs } = node.run!
      const recording = node.outputs?.at(-1)
      const key = liveRunKey(section.id, path)
      gen.liveRunKeys.set(node, key)
      runs[key] = {
        block: key,
        ...executor ? { executor } : {},
        ...session ? { session } : {},
        ...timeoutMs ? { timeout: timeoutMs } : {},
        ...recording ? { recording: liveRunRecording(recording, gen) } : {},
      }
    }
  }
  return Object.keys(runs).length ? { presmiumRuns: runs } : {}
}

/** A live code block as Slidev's `{monaco-run}`, with the options of its run. */
export function monacoRun(node: CodeNode, block: IRBlock, gen: Generation): string {
  const options = `runnerOptions:$slidev.configs.presmiumRuns['${(gen.liveRunKeys.get(node) ?? liveRunKey(gen.section, block.id)).replace(/['\\]/g, '\\$&')}']`
  return fence(monacoRunLang(node.lang)!, node.value, ` {monaco-run} {autorun:'once',height:'auto',${options}}`)
}
