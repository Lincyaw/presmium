import { languageId } from '@lincyaw/kernel'

const PYTHON_ARG = `def _pm_arg(raw):
    import ast, json
    try:
        return ast.literal_eval(raw)
    except (ValueError, SyntaxError, TypeError, MemoryError, RecursionError):
        pass
    try:
        return json.loads(raw)
    except (ValueError, TypeError, RecursionError):
        return raw`

/** Code that assigns the run's arguments to variables before its code; in Python each value is read as a literal or as JSON when it is one. */
export function argsPrelude(args: Record<string, string> | undefined, lang = ''): string | undefined {
  const python = languageId(lang) === 'python'
  const lines = Object.entries(args ?? {})
    .filter(([name]) => /^[A-Za-z_]\w*$/.test(name))
    .map(([name, value]) => `${name} = ${python ? `_pm_arg(${JSON.stringify(String(value))})` : JSON.stringify(String(value))}`)
  if (lines.length === 0) return undefined
  return python ? [PYTHON_ARG, ...lines, 'del _pm_arg'].join('\n') : lines.join('\n')
}
