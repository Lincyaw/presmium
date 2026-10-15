#!/usr/bin/env node
// Sources ship as TypeScript (docs/architecture.md section 3); jiti loads them.
import { createJiti } from 'jiti'

const jiti = createJiti(import.meta.url)
const { exportMain } = await jiti.import('../src/node/cli.ts')
process.exitCode = await exportMain(process.argv.slice(2))
