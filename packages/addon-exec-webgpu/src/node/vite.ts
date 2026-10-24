import { readdirSync, readFileSync } from 'node:fs'
import { findPackageJSON } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import type { RuntimeAssets } from '@lincyaw/kernel'

const JAX_DIR = 'presmium/jax-js/'
const LICENSE = 'LICENSE'

function jaxFiles(): { dist: string, license: string } {
  const manifest = findPackageJSON('@jax-js/jax', import.meta.url)
  if (!manifest) throw new Error('@jax-js/jax is not installed')
  const { exports } = JSON.parse(readFileSync(manifest, 'utf8')) as { exports: { '.': { import: string } } }
  return { dist: dirname(resolve(dirname(manifest), exports['.'].import)), license: join(dirname(manifest), LICENSE) }
}

/** The ES module build of jax-js, at `<base>presmium/jax-js/`. */
export function jaxAssets(): RuntimeAssets {
  const { dist, license } = jaxFiles()
  const types = Object.fromEntries([
    ...readdirSync(dist).filter(file => file.endsWith('.js')).map(file => [file, 'text/javascript']),
    [LICENSE, 'text/plain; charset=utf-8'],
  ])
  return { name: 'presmium:jax-js', prefix: JAX_DIR, types, source: file => (file === LICENSE ? license : join(dist, file)) }
}
