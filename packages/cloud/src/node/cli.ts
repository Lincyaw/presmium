import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import type { Duplex } from 'node:stream'
import { systemLocale } from '@lincyaw/kernel/node'
import { createCloudApp } from './app.ts'
import { readCloudConfig, studioOrigins } from './config.ts'
import type { CloudConfig } from './config.ts'
import { Database } from './database.ts'
import { CloudError } from '../domain/errors.ts'
import { DockerEngine } from './docker.ts'
import { RuntimeStorage, UnenforcedStorage } from './runtime-storage.ts'
import { RuntimeWatchdog } from './runtime-watchdog.ts'
import { ObjectStorage } from './storage.ts'
import { StudioRunner, Studios } from './studios.ts'

const text = {
  'zh-CN': { help: '用法：presmium-cloud [serve|migrate|storage-init|runner|watchdog]\n通过 CLOUD_* 环境变量配置云服务。', started: '云服务已启动', failed: '云服务启动失败', missing: '请设置环境变量' },
  en: { help: 'Usage: presmium-cloud [serve|migrate|storage-init|runner|watchdog]\nConfigure the service using CLOUD_* environment variables.', started: 'Cloud service started', failed: 'Cloud service failed to start', missing: 'Missing environment variable' },
}

function stopped(close: () => Promise<void>): Promise<void> {
  return new Promise(done => {
    const stop = () => { process.off('SIGTERM', stop); process.off('SIGINT', stop); void close().finally(done) }
    process.once('SIGTERM', stop); process.once('SIGINT', stop)
  })
}

/** The trusted runner: the only process with Docker; it makes each Studio's container match its desired state. */
async function runner(config: CloudConfig, db: Database): Promise<void> {
  const storageOptions = config.runtime.storage
  if (!storageOptions) throw new CloudError(500, 'configuration-missing', { key: 'CLOUD_RUNTIME_STORAGE_HOST' })
  const options = { mountRoot: storageOptions.mountRoot, hostRoot: storageOptions.hostRoot, instanceId: config.runtime.instanceId }
  const storage = storageOptions.unenforced ? new UnenforcedStorage(options) : new RuntimeStorage(db, options)
  if (storageOptions.unenforced) process.stderr.write('studio runner: storage without quotas (loopback trial only)\n')
  const engine = new DockerEngine({ socketPath: config.runtime.dockerSocket })
  await engine.ping(); await storage.ready()
  const connect = [config.runtime.runnerContainerId, config.runtime.gatewayContainerId].filter((id): id is string => Boolean(id))
  const studios = new Studios(db, config.runtime.credentialKey)
  const studioRunner = new StudioRunner(studios, engine, config.runtime.profile, { instanceId: config.runtime.instanceId, publicOrigins: slug => studioOrigins(config, slug), connect, storage })
  const controller = new AbortController(), running = studioRunner.run(`runner-${randomUUID()}`, controller.signal)
  const health = createServer((request, response) => {
    void (async () => {
      try { await engine.ping(); await storage.ready(); await db.query('SELECT 1'); response.writeHead(200).end('ready') }
      catch { response.writeHead(503).end('unavailable') }
    })()
  }).listen(config.runtime.port, config.host)
  await stopped(async () => { controller.abort(); await running; health.close(); engine.close() })
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
      const running = watchdog.run(controller.signal)
      await stopped(async () => { controller.abort(); await running; await watchdog.close(); engine.close() })
      return 0
    }
    if (command === 'migrate') {
      if (!process.env.CLOUD_DATABASE_URL) throw new CloudError(500, 'configuration-missing', { key: 'CLOUD_DATABASE_URL' })
      db = new Database(process.env.CLOUD_DATABASE_URL); await db.migrate(); await db.close(); return 0
    }
    const config = await readCloudConfig()
    if (command === 'storage-init') {
      const storage = new ObjectStorage(config.storage)
      await storage.initialize(); storage.close(); return 0
    }
    db = new Database(config.databaseUrl); await db.migrate()
    if (command === 'runner') { await runner(config, db); await db.close(); return 0 }
    const cloud = await createCloudApp(config, db)
    const server = createServer((request, response) => cloud.listener(request, response))
    const sockets = new Set<Duplex>()
    server.on('upgrade', (request, socket, head) => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); void cloud.upgrade(request, socket, head).catch(() => socket.destroy()) })
    server.listen(config.port, config.host, () => process.stdout.write(`${t.started}: ${config.publicUrl}\n`))
    await stopped(async () => {
      await new Promise<void>(done => { server.close(() => done()); server.closeAllConnections(); for (const socket of sockets) socket.destroy() })
      await cloud.close()
    })
    await db.close()
    return 0
  } catch (error) {
    await db?.close().catch(() => {})
    const detail = error instanceof CloudError ? error.code === 'configuration-missing' ? `${t.missing} ${error.details?.key}` : error.code : error instanceof Error ? error.message : String(error)
    process.stderr.write(`${t.failed}: ${detail}\n`)
    return 1
  }
}
