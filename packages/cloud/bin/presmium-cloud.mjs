#!/usr/bin/env node
import { createJiti } from 'jiti'
const jiti = createJiti(import.meta.url)
const { main } = await jiti.import('../src/node/cli.ts')
process.exitCode = await main(process.argv.slice(2))
