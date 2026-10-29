import { serve } from '@hono/node-server'
import { systemLocale } from '@lincyaw/kernel/node'
import { createCloudApp } from './app.ts'
import { readCloudConfig } from './config.ts'
import { Database } from './database.ts'
import { CloudError } from '../domain/errors.ts'
import { createRuntimeHttp } from './runtime-http.ts'
import type { Duplex } from 'node:stream'
import { DockerEngine } from './docker.ts'
import { RuntimeWatchdog } from './runtime-watchdog.ts'

const text = {
  'zh-CN': { help: '用法：presmium-cloud [serve|migrate|storage-init|runner|watchdog]\n通过 CLOUD_* 环境变量配置云服务。', started: '云服务已启动', failed: '云服务启动失败', missing: '请设置环境变量' },
  en: { help: 'Usage: presmium-cloud [serve|migrate|storage-init|runner|watchdog]\nConfigure the service using CLOUD_* environment variables.', started: 'Cloud service started', failed: 'Cloud service failed to start', missing: 'Missing environment variable' },
}

export async function main(args: string[]): Promise<number> {
  const t = text[systemLocale()]
  if (args.includes('--help') || args.includes('-h')) { process.stdout.write(`${t.help}\n`); return 0 }
  const [command = 'serve', ...rest] = args
  if (rest.length || !['serve', 'migrate', 'storage-init', 'runner', 'watchdog'].includes(command)) { process.stderr.write(`${t.help}\n`); return 2 }
  let db: Database | undefined
  try {
    if (command === 'watchdog') {
      const instanceId = process.env.CLOUD_INSTANCE_ID
      if (!instanceId) throw new CloudError(500, 'configuration-missing', { key: 'CLOUD_INSTANCE_ID' })
      const engine = new DockerEngine({ socketPath: process.env.CLOUD_DOCKER_SOCKET ?? '/var/run/docker.sock' })
      await engine.ping()
      const watchdog = new RuntimeWatchdog(engine, { instanceId }), controller = new AbortController()
      const stop = () => controller.abort()
      process.once('SIGTERM', stop); process.once('SIGINT', stop)
      try { await watchdog.run(controller.signal) }
      finally { process.off('SIGTERM', stop); process.off('SIGINT', stop); await watchdog.close(); engine.close() }
      return 0
    }
    if (command === 'migrate') {
      if (!process.env.CLOUD_DATABASE_URL) throw new CloudError(500, 'configuration-missing', { key: 'CLOUD_DATABASE_URL' })
      db = new Database(process.env.CLOUD_DATABASE_URL); await db.migrate(); await db.close(); return 0
    }
    const config = await readCloudConfig()
    db = new Database(config.databaseUrl); await db.migrate()
    if (command === 'runner') {
      const runtime = await createRuntimeHttp(config, db)
      const server = serve({ fetch: runtime.app.fetch, hostname: config.host, port: config.runtime.port })
      const sockets = new Set<Duplex>()
      server.on('upgrade', (request, socket, head) => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); void runtime.upgrade(request, socket, head).catch(() => socket.destroy()) })
      let stop!: () => void
      let closing: Promise<void> | undefined
      await new Promise<void>(done => {
        stop = () => {
          if (closing) return
          server.close(() => done())
          closing = runtime.close()
          for (const socket of sockets) socket.destroy()
          void closing.catch(() => {})
        }
        process.once('SIGTERM', stop); process.once('SIGINT', stop)
      })
      await closing
      process.off('SIGTERM', stop); process.off('SIGINT', stop)
      await db.close(); return 0
    }
    const cloud = await createCloudApp(config, db)
    if (command === 'storage-init') {
      if (!cloud.storage) throw new CloudError(503, 'asset-storage-unavailable')
      await cloud.storage.initialize(); await cloud.close(); await db.close(); return 0
    }
    const server = serve({ fetch: cloud.app.fetch, hostname: config.host, port: config.port }, () => process.stdout.write(`${t.started}: ${config.publicUrl}\n`))
    const sockets = new Set<Duplex>()
    server.on('upgrade', (request, socket, head) => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); void cloud.upgrade(request, socket, head).catch(() => socket.destroy()) })
    let finish!: () => void
    const stopped = new Promise<void>(done => { finish = done })
    let closing: Promise<void> | undefined
    const stop = () => {
      if (closing) return
      server.close(() => finish())
      closing = cloud.close()
      for (const socket of sockets) socket.destroy()
      void closing.catch(() => {})
    }
    process.once('SIGTERM', stop); process.once('SIGINT', stop)
    await stopped
    process.off('SIGTERM', stop); process.off('SIGINT', stop)
    await closing; await db.close(); return 0
  } catch (error) {
    await db?.close().catch(() => {})
    const detail = error instanceof CloudError ? error.code === 'configuration-missing' ? `${t.missing} ${error.details?.key}` : error.code : error instanceof Error ? error.message : String(error)
    process.stderr.write(`${t.failed}: ${detail}\n`)
    return 1
  }
}
