/**
 * Names an anchor may point at in a file, harvested from its text for
 * completion: region names from `#region` markers, and declaration paths
 * (`Parser.parse`) for symbols. The harvest is generous; a name is offered
 * only when the deck's resolver for the anchor's scheme resolves it.
 */

const REGION = /(?<![A-Za-z])#?region\b[ \t]*(.*?)[ \t]*(?:-->|\*\/|\*\))?[ \t]*$/i

/** Names of the `#region` markers in the comment styles of the region anchors, in order. */
export function regionNames(text: string): string[] {
  const names = text.split(/\r?\n/).map(line => REGION.exec(line)?.[1] ?? '').filter(Boolean)
  return [...new Set(names)]
}

const DECLARATION = /\b(class|def|function\*?|interface|type|enum|namespace|const|let|var)\s+([A-Za-z_$][\w$]*)/
const MEMBER = /^\s+(?:(?:export|public|private|protected|static|readonly|async|abstract|override|declare|get|set|def)\s+)*\*?([A-Za-z_$][\w$]*)\s*[(<:=?!]/
const ASSIGNMENT = /^([A-Za-z_]\w*)\s*(?::[^=]*)?=(?!=)/
const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'else', 'elif', 'with', 'try', 'new', 'await', 'yield', 'throw', 'print', 'self', 'this', 'super'])

/**
 * Declaration paths of a TypeScript, JavaScript or Python file: top-level
 * declarations and assignments, and the members of classes as `Class.member`,
 * nested by indentation.
 */
export function declarationNames(text: string): string[] {
  const names = new Set<string>()
  const classes: { name: string, indent: number }[] = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    const indent = /^[ \t]*/.exec(line)![0].length
    while (classes.length > 0 && indent <= classes.at(-1)!.indent) classes.pop()
    const declared = DECLARATION.exec(line)
    const name = declared?.[2] ?? (classes.length > 0 ? MEMBER.exec(line)?.[1] : ASSIGNMENT.exec(line)?.[1])
    if (!name || KEYWORDS.has(name)) continue
    names.add([...classes.map(c => c.name), name].join('.'))
    if (declared?.[1] === 'class') classes.push({ name, indent })
  }
  return [...names]
}
