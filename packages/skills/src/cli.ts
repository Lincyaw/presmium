import { parseArgs } from 'node:util'
import { systemLocale } from '@lincyaw/kernel/node'
import { installBundledSkills } from './install.ts'
import { MESSAGES } from './messages.ts'
import { SkillError } from './resources.ts'

export async function main(args: string[]): Promise<number> {
  const t = MESSAGES[systemLocale()]
  let values: { json?: boolean, help?: boolean, name?: string[], 'parent-stdin'?: boolean }, positionals: string[]
  try {
    const parsed = parseArgs({ args, allowPositionals: true, options: { json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' }, name: { type: 'string', multiple: true }, 'parent-stdin': { type: 'boolean' } } })
    values = parsed.values; positionals = parsed.positionals
    if (values.help) { process.stdout.write(t.usage); return 0 }
    if (positionals.length !== 2 || positionals[0] !== 'install') throw new Error()
  } catch { process.stderr.write(`${t.usageError}\n`); return 2 }
  const controller = new AbortController()
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const
  const stop = () => controller.abort()
  for (const signal of signals) process.on(signal, stop)
  if (values['parent-stdin']) {
    process.stdin.on('end', stop)
    process.stdin.resume()
    if (process.stdin.readableEnded || process.stdin.destroyed) stop()
  }
  try {
    const result = await installBundledSkills(positionals[1]!, { names: values.name, signal: controller.signal })
    process.stdout.write(values.json ? `${JSON.stringify(result)}\n` : `${t.installed(result.installed.length, result.skipped.length)}\n`)
    return 0
  } catch (error) {
    const code = error instanceof SkillError ? error.code : 'skill-unavailable'
    if (values.json) process.stdout.write(`${JSON.stringify({ error: code })}\n`)
    process.stderr.write(`${t.errors[code]}\n`)
    return 1
  } finally {
    for (const signal of signals) process.off(signal, stop)
    if (values['parent-stdin']) {
      process.stdin.off('end', stop)
      process.stdin.pause()
    }
  }
}
