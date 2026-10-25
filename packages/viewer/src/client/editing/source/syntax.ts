const JAVASCRIPT = new Set(['js', 'javascript', 'mjs', 'cjs', 'ts', 'typescript', 'mts', 'cts', 'jsx', 'tsx'])

/** Syntax only: resolution and execution still belong to the document's real build. */
export async function validateSource(language: string, content: string): Promise<void> {
  const name = language.trim().toLowerCase()
  if (!JAVASCRIPT.has(name)) return
  const { javascript } = await import('@codemirror/lang-javascript')
  const support = javascript({ typescript: ['ts', 'typescript', 'mts', 'cts', 'tsx'].includes(name), jsx: name === 'jsx' || name === 'tsx' })
  let at: number | undefined
  support.language.parser.parse(content).iterate({
    enter(node) {
      if (at !== undefined) return false
      if (node.type.isError) at = node.from
    },
  })
  if (at === undefined) return
  const before = content.slice(0, at)
  const line = before.split('\n').length
  const column = at - before.lastIndexOf('\n')
  throw new Error(`source-syntax:${line}:${column}`)
}
