import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { mapHtmlUrls } from '@lincyaw/kernel'
import { build } from 'vite'
import { SITE_CONTENT_ELEMENT } from '../domain/index.ts'
import { imageCache, ImageEncoder } from './images.ts'
import type { SiteContent } from '../domain/index.ts'

/** A website template is an ordinary Vite HTML entry, with its own CSS and modules. */
export async function buildLandingTemplate(file: string, workDir: string, base: string, content: SiteContent, workspaceRoot: string): Promise<{ html: string, dir: string }> {
  const dir = join(workDir, 'template')
  const data = JSON.stringify(content).replace(/</g, '\\u003c')
  await build({
    configFile: false,
    root: dirname(file),
    base,
    publicDir: join(workspaceRoot, 'public'),
    logLevel: 'silent',
    plugins: [new ImageEncoder(imageCache(workspaceRoot)).vitePlugin(), {
      name: 'presmium-site-content',
      transformIndexHtml: { order: 'pre', handler: () => [{ tag: 'script', attrs: { id: SITE_CONTENT_ELEMENT, type: 'application/json' }, children: data, injectTo: 'head' }] },
    }, {
      // The theme's stylesheets come first in the head, before the template's own, which can build on them; added after
      // the build reads the page, since they are the site's files and not the template's.
      name: 'presmium-site-theme',
      transformIndexHtml: { order: 'post', handler: () => (content.theme?.stylesheets ?? []).map(href => ({ tag: 'link', attrs: { rel: 'stylesheet', href }, injectTo: 'head-prepend' as const })) },
    }],
    build: { outDir: dir, emptyOutDir: true, copyPublicDir: false, assetsDir: '_landing/assets', rollupOptions: { input: file } },
  })
  const html = mapHtmlUrls(readFileSync(join(dir, basename(file)), 'utf8'), url => url.startsWith('/') && !url.startsWith('//') && !url.startsWith(base) ? `${base}${url.slice(1)}` : undefined)
  return { html, dir }
}

export function writeLandingTemplate(output: { html: string, dir: string }, outDir: string, prefix = ''): void {
  // Only emitted assets are shared; the entry itself is mounted as the site's index.html.
  if (existsSync(join(output.dir, '_landing'))) cpSync(join(output.dir, '_landing'), join(outDir, '_landing'), { recursive: true, force: true })
  const index = join(outDir, prefix, 'index.html')
  mkdirSync(dirname(index), { recursive: true })
  writeFileSync(index, output.html)
}
