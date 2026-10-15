#!/usr/bin/env node
// Sources ship as TypeScript (docs/architecture.md section 3); jiti loads them.
import { createJiti } from 'jiti'

const jiti = createJiti(import.meta.url)
const { main } = await jiti.import('../src/cli.ts')
const code = await main(process.argv.slice(2))
if (code !== undefined) process.exitCode = code
