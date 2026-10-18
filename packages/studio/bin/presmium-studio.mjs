#!/usr/bin/env node
// `presmium studio` as a command of its own (`npx @presmium/studio`). Sources ship as TypeScript
// (docs/architecture.md section 3); jiti loads them.
import { createJiti } from 'jiti'

const jiti = createJiti(import.meta.url)
const { main } = await jiti.import('../src/cli.ts')
process.exitCode = await main(process.argv.slice(2))
