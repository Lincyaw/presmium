import { execFileSync } from 'node:child_process'
import { existsSync, renameSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { errorMessage } from '@lincyaw/kernel'
import { applyMigration, planMigration } from '@lincyaw/compiler/migrate'
import type { CliMessages } from './messages.ts'

/** A rename that keeps the file's history where git tracks it (`git mv`), a plain rename elsewhere. */
function renameKeepingHistory(root: string) {
  return (from: string, to: string) => {
    try { execFileSync('git', ['mv', '--', from, to], { cwd: root, stdio: 'ignore' }) }
    catch { renameSync(join(root, from), join(root, to)) }
  }
}

/** `presmium migrate [<dir>] [--check]`: converts the documents of a workspace or one document to the current format. */
export async function runMigrateCommand(argv: string[], t: CliMessages): Promise<number> {
  let parsed
  try {
    parsed = parseArgs({ args: argv, allowPositionals: true, options: { check: { type: 'boolean', default: false }, help: { type: 'boolean', short: 'h', default: false } } })
  } catch (error) {
    process.stderr.write(`presmium: ${errorMessage(error)}\n\n${t.migrateHelp}\n`)
    return 2
  }
  const { values, positionals } = parsed
  if (values.help) { process.stdout.write(`${t.migrateHelp}\n`); return 0 }
  if (positionals.length > 1) { process.stderr.write(`presmium: ${t.unexpectedArgument(positionals[1]!)}\n`); return 2 }
  const root = resolve(positionals[0] ?? '.')
  if (!existsSync(root)) { process.stderr.write(`presmium: ${t.notFound(positionals[0] ?? '.')}\n`); return 2 }
  const plan = planMigration(root)
  const shown = (path: string) => relative(process.cwd(), join(root, path)) || '.'
  for (const { from, to } of plan.renames) process.stdout.write(`${t.migrateRename(shown(from), shown(to))}\n`)
  for (const path of plan.documents) process.stdout.write(`${t.migrateDocument(shown(path))}\n`)
  if (plan.workspaceFile) process.stdout.write(`${t.migrateWorkspaceFile}\n`)
  for (const problem of plan.problems) process.stderr.write(`${t.migrateProblem(shown(problem.path), problem.message)}\n`)
  const pending = plan.documents.length > 0 || plan.workspaceFile || plan.writes.length > 0
  if (!pending) {
    process.stdout.write(`${t.migrateNothing(relative(process.cwd(), root) || '.')}\n`)
    return plan.problems.length ? 1 : 0
  }
  if (values.check) {
    process.stdout.write(`${t.migrateNeeded(plan.documents.length, plan.workspaceFile)}\n`)
    return 1
  }
  applyMigration(plan, renameKeepingHistory(root))
  process.stdout.write(`${t.migrateDone(plan.documents.length)}\n`)
  return plan.problems.length ? 1 : 0
}
